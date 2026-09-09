import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';

import {
  DOC_ONLY_RULES,
  deriveGlobalRules,
  derivePackageRules,
  METRIC_GATES,
  PLUGIN_GATES,
  toArray,
  unavailableGate,
  unreachedTestGlobs,
  selfOnlyReexportSelector,
  resolveTestFiles,
} from '../emit/lint/patterns';
import type { GateSpec } from '../emit/lint/patterns';
import {
  readSetting,
  resolveArchitecture,
} from '../config';
import type { Blueprint } from '../config';
import { testFileReach } from './coverage';
import { scan } from './scan';

/**
 * `blueprint rules` — the emitted-rule catalog as a queryable command, so nobody
 * has to reverse-engineer it from the bundle. With a config present, every gate is
 * annotated with what the blueprint actually declares.
 */

export interface RulesOptions {
  /** Emit machine-readable JSON instead of the text catalog. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

export interface StructuralRule {
  rule: string;
  covers: string;
}

/**
 * One declared source position's resolved bans — what the structural rules
 * actually enforce there. Field agents answered "is the rule really wired?" by parsing
 * `eslint --print-config` output by hand (issue #7); this is that view,
 * derived from the same primitives emitLint compiles from.
 */
export interface LayerBans {
  layer: string;
  /** Layers this one must not import. */
  forbidden: string[];
  /** Owned packages banned here (named imports in parentheses). */
  packages: string[];
  /**
   * Why this column needs verifying by hand. Beside the field it is about, not once
   * at the top: a consumer reading `bans[i].packages` never looks at a sibling key.
   */
  packagesNote?: string;
  /** Owned globals banned here. */
  globals: string[];
  /**
   * The selfOnly re-export bans on this layer's files — the exact
   * `no-restricted-syntax` selector per (target, alias).
   *
   * `selectors` is what ESLint resolves and doctor compares; it is a trap to paste,
   * because the `/` escapes resolve when JS parses the string literal and the regex
   * silently ends early — no parse error, lint still green. `jsLiteral` is the same
   * selector as JS source, quotes included, so the paste survives (field run #125).
   *
   * `note` repeats per entry rather than sitting once at the top: an agent arrives
   * here for selectors to copy, and a caveat has to be where the copy happens.
   */
  selfOnly: { target: string; selectors: string[]; jsLiteral: string[]; note: string }[];
  /**
   * The test-exemption globs the emitted entry carries alongside these bans. A
   * combined entry rebuilt from `selectors` alone drops them silently and starts
   * reaching the test files those globs reach (field issue #60) — carry them wherever
   * the selectors land.
   */
  testExemptions: string[];
}

/** One optional gate, annotated with the resolved config when present. */
export interface GateStatus {
  id: string;
  /** The ESLint rule it emits — or the runtime that enforces it instead. */
  emits: string;
  note: string;
  /** Metric fallback threshold, when the gate is one of the metric family. */
  fallback?: number;
  /**
   * Why the gate is unavailable here — absent when it can be opened. It is the
   * difference between this catalog's row count and the `N/M optional gates`
   * denominator, so a reader comparing the two is told which, not left to infer
   * (field run #137).
   */
  unavailable?: string;
  /** The declared setting, resolved — null when the config does not declare it. */
  declared: { tier: string; value?: number } | null;
  /** Whether the emitted config would carry it today. */
  active: boolean;
}

const PACKAGES_NOT_COMPARED = [
  '`packages` is not compared by doctor\'s survival check — a merge that drops a',
  'package ban stays green there, so verify this column yourself with',
  '`npx eslint --print-config <a file in the layer>`.',
];

const SELF_ONLY_MESSAGE_NOTE
  = 'copy `jsLiteral`, not `selectors`: pasted into JS source a rendered selector '
    + 'loses its \\u002F escape and the regex ends at the bare /, silently. The ban '
    + 'message text is yours to write — doctor verifies selectors, never messages';

export const STRUCTURAL_RULES: StructuralRule[] = [
  {
    rule: 'no-restricted-imports',
    covers: 'dependency flow, same-layer bans, package ownership — '
      + 'whole packages or named imports ({ package, imports }); same-signature owns merge — '
      + 'and fixture bans',
  },
  {
    rule: 'no-restricted-syntax',
    covers: 'selfOnly re-export bans — emitted only when an allowedImporters ENTRY declares '
      + 'selfOnly: true (a layer-level selfOnly key is invalid)',
  },
  {
    rule: 'no-restricted-globals',
    covers: 'global ownership (owns: [{ global: … }]) — '
      + 'emitted only where some layer is barred from an owned global',
  },
  {
    rule: 'blueprint/relative-escape',
    covers: '../ unit escapes at any depth (embedded plugin)',
  },
  {
    rule: 'blueprint/import-boundary',
    covers: 'canonical cross-boundary alias spelling and statically resolved dynamic imports '
      + '(embedded plugin)',
  },
];

export interface StructuralStatus extends StructuralRule {

  active: boolean | null;
}

function resolveStructural(blueprint: Blueprint | null): StructuralStatus[] {
  if (!blueprint) {
    return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));
  }

  const architecture = resolveArchitecture(blueprint.architecture);
  const layers = architecture.layers.map((layer) => layer.definition);
  const globalRules = deriveGlobalRules(layers);

  const active: Record<string, boolean> = {
    'no-restricted-imports': true,
    'blueprint/relative-escape': true,
    'blueprint/import-boundary': true,
    'no-restricted-syntax': architecture.hasSelfOnly,
    'no-restricted-globals': architecture.topology === 'module-first'
      ? globalRules.length > 0
      : layers.some((layer) =>
          globalRules.some((rule) => !rule.allowedIn.includes(layer.name))),
  };

  return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: active[rule.rule] }));
}

function gateSpecs(): GateSpec[] {
  return [
    ...METRIC_GATES.map((gate) => ({
      id: gate.id,
      emits: gate.rule,

      note: gate.wrap ? 'counts code lines only (comments and blanks skipped)' : 'plain threshold',
      fallback: gate.fallback,
    })),
    ...PLUGIN_GATES,
  ];
}

function layerBans(blueprint: Blueprint): LayerBans[] {
  const { architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const definitions = resolved.layers.map((layer) => layer.definition);
  const packageRules = derivePackageRules(definitions);
  const globalRules = deriveGlobalRules(definitions);

  const positioned = resolved.layerPositions.map((position) => {
    const layer = position.layer.definition;
    const module = position.module?.name;
    const qualify = (target: string) => module ? `${module}/${target}` : target;

    const packages = packageRules
      .filter((rule) => !rule.allowedIn.includes(layer.name))
      .map((rule) => (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package));

    return {
      layer: qualify(layer.name),
      forbidden: resolved.forbiddenLayers(layer.name).map(qualify),
      packages,
      ...(packages.length ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') } : {}),
      globals: globalRules
        .filter((rule) => !rule.allowedIn.includes(layer.name))
        .map((rule) => rule.global),
      selfOnly: resolved.selfOnlyTargets(layer.name).map((target) => {
        const selectors = resolved.aliasSpecifiers(target, module)
          .flatMap((specifier) => selfOnlyReexportSelector(specifier));

        return {
          target: qualify(target),
          selectors,

          jsLiteral: selectors.map((selector) => JSON.stringify(selector)),
          note: SELF_ONLY_MESSAGE_NOTE,
        };
      }),
      testExemptions: resolveTestFiles(architecture.testFiles),
    };
  });

  if (resolved.topology !== 'module-first') {
    return positioned;
  }

  const containerPackages = packageRules.map((rule) => rule.imports?.length
    ? `${rule.package} (${rule.imports.join(', ')})`
    : rule.package);

  const containers = resolved.modules.map((module): LayerBans => ({
    layer: `${module.name} (container)`,
    forbidden: [],
    packages: containerPackages,
    ...(containerPackages.length ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') } : {}),
    globals: globalRules.map((rule) => rule.global),
    selfOnly: [],
    testExemptions: resolveTestFiles(architecture.testFiles),
  }));

  return [...positioned, ...containers];
}

function unavailableNote(gates: GateStatus[]): string {
  const out = gates.filter((gate) => gate.unavailable !== undefined);

  if (!out.length) {
    return ' — none of them unavailable here, so `inspect` counts the same number';
  }

  return ` — ${out.length} of them unavailable here, which \`inspect\` and \`doctor\` `
    + 'leave out of their optional-gate count';
}

function unavailableCauses(gates: GateStatus[]): string[] {
  return gates
    .filter((gate) => gate.unavailable !== undefined)
    .map((gate) => `· ${gate.id}: ${gate.unavailable}`);
}

function resolveGate(
  spec: GateSpec,
  blueprint: Blueprint | null,
  stack: { hasTypescript: boolean },
): GateStatus {
  const setting = blueprint?.rules?.[spec.id];

  const read = setting === undefined ? null : readSetting(setting);

  const declared = read === null
    ? null
    : { tier: read.tier, ...(read.value !== undefined ? { value: read.value } : {}) };

  const unavailable = unavailableGate(spec.id, {
    framework: blueprint?.framework,
    hasTypescript: stack.hasTypescript,
    testFiles: blueprint?.architecture.testFiles,
  });

  return {
    ...spec,
    declared,
    ...(unavailable !== null ? { unavailable } : {}),
    active: declared !== null && declared.tier !== 'off' && unavailable === null,
  };
}

function measureTestGlobs(root: string, blueprint: Blueprint | null): string | null {
  if (!blueprint) {
    return null;
  }

  const declared = toArray(blueprint.architecture.testFiles);

  if (!declared.length) {
    return null;
  }

  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;

  return unreachedTestGlobs(testFileReach(
    scan(root, sourceRoot),
    declared,
    sourceRoot,
  ));
}

/**
 * Run `blueprint rules` in `root`. Read-only and config-optional: without a
 * config it prints the static catalog; with one, every gate is annotated
 * with the declared tier and whether it emits today.
 * @group Runtimes
 * @example
 * const { gates } = await runRules(process.cwd());
 *
 * console.log(gates.filter((gate) => gate.active).map((gate) => gate.id));
 */
export async function runRules(
  root: string,
  options: RulesOptions = {},
): Promise<{ severity: string; gates: GateStatus[]; bans: LayerBans[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  const blueprint = state.hasConfig
    ? (await resolveBlueprint(root, state, options)).blueprint
    : null;

  const severity = blueprint?.emit?.lint?.severity ?? 'error';
  const structural = resolveStructural(blueprint);

  const testExemption = measureTestGlobs(root, blueprint);

  const gates = gateSpecs()
    .map((spec) => resolveGate(spec, blueprint, { hasTypescript: state.hasTypescript }));

  const bans = blueprint ? layerBans(blueprint) : [];

  log(
    options.json
      ? JSON.stringify({
          severity,
          structural,
          gates,
          bans,
          docsOnly: DOC_ONLY_RULES,

          ...(testExemption === null ? {} : { testExemption }),
        }, null, 2)
      : renderRules({ severity, structural, gates, bans, testExemption }, blueprint !== null),
  );

  return { severity, gates, bans };
}

export function renderRules(
  catalog: {
    severity: string;
    structural: StructuralStatus[];
    gates: GateStatus[];
    bans: LayerBans[];

    testExemption?: string | null;
  },
  hasConfig: boolean,
): string {
  const { severity, structural, gates, bans, testExemption } = catalog;

  const status = (gate: GateStatus) => {
    if (gate.unavailable !== undefined) {
      return gate.declared === null ? '· unavailable here' : '· declared, unavailable here';
    }

    if (gate.declared === null) {
      return '· not declared';
    }

    if (!gate.active) {
      return '· off';
    }

    return `✓ ${gate.declared.tier}${gate.declared.value !== undefined ? `(${gate.declared.value})` : ''}`;
  };

  return [
    'blueprint rules — the emitted-rule catalog',
    '',

    `Structural — dependency flow & ownership · severity: ${severity} (emit.lint.severity covers only these)`,
    ...structural.map((rule) =>
      rule.active === null
        ? `  ${rule.rule.padEnd(28)} ${rule.covers}`
        : `  ${(rule.active ? '✓ emits' : '· not emitted').padEnd(16)} ${rule.rule.padEnd(28)} ${rule.covers}`),
    '',
    'Optional gates — emitted only when declared in `rules` with a tier other than off.',
    'Every gate scopes to the declared architecture file globs; module-first root containers '
    + 'are included.',

    `${gates.length} listed${unavailableNote(gates)}`,
    ...unavailableCauses(gates),

    ...(testExemption ? [`· ${testExemption}`] : []),
    ...gates.map((gate) => {
      const fallback = gate.fallback !== undefined ? ` (default ${gate.fallback})` : '';

      return `  ${status(gate).padEnd(16)} ${gate.id} → ${gate.emits}${fallback} — ${gate.note}`;
    }),
    '',
    'Documentation-only — never an ESLint line',
    ...DOC_ONLY_RULES.map((entry) => `  ${entry.id} — ${entry.note}`),

    ...(bans.length
      ? [
          '',
          'Per-layer bans — what the structural rules enforce, resolved from this config.',

          '`no-import`, `globals` and the selfOnly selectors are what doctor compares,',
          'and it compares TEXTUALLY: a pattern group reordered or a selector respelled to',
          'an equivalent (`\\/` for `/`) reads as missing even though eslint would still',
          'enforce it. Copy, do not retype.',

          ...(bans.some((ban) => ban.packages.length) ? PACKAGES_NOT_COMPARED : []),
          ...bans.flatMap((entry) => [
            `  ${entry.layer.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`,

            ...entry.selfOnly.flatMap((ban) => [
              `    selfOnly: no re-export from "${ban.target}" — folding your own`
              + ' no-restricted-syntax into one entry? Paste these verbatim, quotes'
              + ' included, per the caveat above — they are JS source, not values'
              + ` (${ban.note}):`,

              ...ban.jsLiteral.map((literal) => `      ${literal}`),

              `      …and carry the exemption the emitted block has for the test files those globs reach: ignores: [${
                entry.testExemptions.map((glob) => `'${glob}'`).join(', ')
              }] — without it your combined entry lints the test files those globs reach, which this ban never covered`,
            ]),
          ]),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ].join('\n');
}
