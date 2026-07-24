import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import {
  DOC_ONLY_RULES,
  deriveGlobalRules,
  derivePackageRules,
  METRIC_GATES,
  PLUGIN_GATES,
  selfOnlyReexportSelector,
} from '../emit/lint/patterns';
import type { GateSpec } from '../emit/lint/patterns';
import { getForbiddenLayers, getSelfOnlyTargets, normalizeAllowedImporters } from '../config';
import type { Blueprint } from '../config';

/**
 * `blueprint rules` — the emitted-rule catalog as a queryable command. Field
 * agents reverse-engineered this exact table from the minified bundle
 * ("which rules always emit, which need declaring, the defaults") — the
 * compiler model demands the tool answer for itself. With a config present,
 * every gate is annotated with what the blueprint actually declares.
 */

export interface RulesOptions {
  /** Emit machine-readable JSON instead of the text catalog. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

/**
 * One always-on structural rule. Not part of the package entry: no public
 * API returns this shape — it travels only inside the `--json` output.
 */
export interface StructuralRule {
  rule: string;
  covers: string;
}

/**
 * One layer's resolved bans — what the structural rules actually enforce
 * there. Field agents answered "is the rule really wired?" by parsing
 * `eslint --print-config` output by hand (issue #7); this is that view,
 * derived from the same primitives emitLint compiles from.
 */
export interface LayerBans {
  layer: string;
  /** Layers this one must not import. */
  forbidden: string[];
  /** Owned packages banned here (named imports in parentheses). */
  packages: string[];
  /** Owned globals banned here. */
  globals: string[];
  /**
   * The selfOnly re-export bans emitted on this layer's files — the exact
   * `no-restricted-syntax` selector per (target, alias). A merge that folds
   * blueprint's entry into the project's own used to have no supported
   * source for these strings but an emitLint dump (field issue #20).
   */
  selfOnly: { target: string; selectors: string[] }[];
}

/** One optional gate, annotated with the resolved config when present. */
export interface GateStatus {
  id: string;
  /** The ESLint rule it emits — or the runtime that enforces it instead. */
  emits: string;
  note: string;
  /** Metric fallback threshold, when the gate is one of the metric family. */
  fallback?: number;
  /** The declared setting, resolved — null when the config does not declare it. */
  declared: { tier: string; value?: number } | null;
  /** Whether the emitted config would carry it today. */
  active: boolean;
}

export const STRUCTURAL_RULES: StructuralRule[] = [
  { rule: 'no-restricted-imports', covers: 'dependency flow, same-layer bans, package ownership — whole packages or named imports ({ package, imports }); same-signature owns merge — and fixture bans' },
  { rule: 'no-restricted-syntax', covers: 'selfOnly re-export bans — emitted only when an allowedImporters ENTRY declares selfOnly: true (a layer-level selfOnly key is invalid)' },
  { rule: 'no-restricted-globals', covers: 'global ownership (owns: [{ global: … }]) — emitted only where some layer is barred from an owned global' },
  { rule: 'blueprint/relative-escape', covers: '../ module escapes at any depth (embedded plugin)' },
];

/** A structural rule annotated with whether THIS config's output carries it. */
export interface StructuralStatus extends StructuralRule {
  /** null without a config (static catalog); resolved boolean with one. */
  active: boolean | null;
}

/**
 * Whether each structural rule would appear in the emitted config — the
 * question a field agent could only answer by calling emitLint and dumping
 * its entries (issue #14: docs said "emits", the config didn't). Mirrors
 * emitLint's conditions from the same primitives — rules.ts must not import
 * lint.ts (module cycle, see the import note above), so the mirror is
 * pinned to emitLint's real output by a test instead.
 */
function resolveStructural(blueprint: Blueprint | null): StructuralStatus[] {
  if (!blueprint) return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));

  const { layers } = blueprint.architecture;
  const globalRules = deriveGlobalRules(layers);

  const active: Record<string, boolean> = {
    'no-restricted-imports': true,
    'blueprint/relative-escape': true,
    'no-restricted-syntax': layers.some((layer) =>
      normalizeAllowedImporters(layer.allowedImporters)
        .some((importer) => importer.selfOnly === true)),
    'no-restricted-globals': layers.some((layer) =>
      globalRules.some((rule) => !rule.allowedIn.includes(layer.name))),
  };

  return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: active[rule.rule] }));
}

function gateSpecs(): GateSpec[] {
  return [
    ...METRIC_GATES.map((gate) => ({
      id: gate.id,
      emits: gate.rule,
      // `wrap` is the gates' one real behavioral split — say it, instead of
      // a filler label ("metric family") that answers nothing.
      note: gate.wrap ? 'counts code lines only (comments and blanks skipped)' : 'plain threshold',
      fallback: gate.fallback,
    })),
    ...PLUGIN_GATES,
  ];
}

/** Every layer's resolved bans, from the same primitives emitLint uses. */
function layerBans(blueprint: Blueprint): LayerBans[] {
  const { architecture } = blueprint;
  const aliases = [architecture.alias, ...Object.keys(architecture.additionalAliases ?? {})];
  const packageRules = derivePackageRules(architecture.layers);
  const globalRules = deriveGlobalRules(architecture.layers);

  return architecture.layers.map((layer) => ({
    layer: layer.name,
    forbidden: getForbiddenLayers(architecture, layer.name),
    packages: packageRules
      .filter((rule) => !rule.allowedIn.includes(layer.name))
      .map((rule) => (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package)),
    globals: globalRules
      .filter((rule) => !rule.allowedIn.includes(layer.name))
      .map((rule) => rule.global),
    selfOnly: getSelfOnlyTargets(architecture, layer.name).map((target) => ({
      target,
      selectors: aliases.map((alias) => selfOnlyReexportSelector(alias, target)),
    })),
  }));
}

function resolveGate(spec: GateSpec, blueprint: Blueprint | null): GateStatus {
  const setting = blueprint?.rules?.[spec.id];

  const declared
    = setting === undefined
      ? null
      : typeof setting === 'string'
        ? { tier: setting }
        : { tier: setting.tier, ...(setting.value !== undefined ? { value: setting.value } : {}) };

  // Mirror emitLint: deepWatch never emits on React, whatever it declares.
  const framework = blueprint?.framework;
  const silenced = spec.id === 'deepWatch' && framework === 'react';

  return {
    ...spec,
    declared,
    active: declared !== null && declared.tier !== 'off' && !silenced,
  };
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
  const gates = gateSpecs().map((spec) => resolveGate(spec, blueprint));
  const bans = blueprint ? layerBans(blueprint) : [];

  log(
    options.json
      ? JSON.stringify({
          severity,
          structural,
          gates,
          bans,
          docsOnly: DOC_ONLY_RULES,
        }, null, 2)
      : renderRules(severity, structural, gates, bans, blueprint !== null),
  );

  return { severity, gates, bans };
}

/** The human-readable catalog. */
export function renderRules(
  severity: string,
  structural: StructuralStatus[],
  gates: GateStatus[],
  bans: LayerBans[],
  hasConfig: boolean,
): string {
  const status = (gate: GateStatus) => {
    if (gate.declared === null) return '· not declared';

    if (!gate.active) {
      return gate.declared.tier === 'off' ? '· off' : '· declared, never emits here';
    }

    return `✓ ${gate.declared.tier}${gate.declared.value !== undefined ? `(${gate.declared.value})` : ''}`;
  };

  return [
    'blueprint rules — the emitted-rule catalog',
    '',
    // "Always emitted" was a lie for two of the four (field issue #14) —
    // with a config, each line states whether THIS config carries it.
    `Structural — dependency flow & ownership · severity: ${severity} (emit.lint.severity covers only these)`,
    ...structural.map((rule) =>
      rule.active === null
        ? `  ${rule.rule.padEnd(28)} ${rule.covers}`
        : `  ${(rule.active ? '✓ emits' : '· not emitted').padEnd(16)} ${rule.rule.padEnd(28)} ${rule.covers}`),
    '',
    'Optional gates — emitted only when declared in `rules` with a tier other than off.',
    'Every gate scopes to the layer file globs — root wiring sits outside all of them.',
    ...gates.map((gate) => {
      const fallback = gate.fallback !== undefined ? ` (default ${gate.fallback})` : '';

      return `  ${status(gate).padEnd(16)} ${gate.id} → ${gate.emits}${fallback} — ${gate.note}`;
    }),
    '',
    'Documentation-only — never an ESLint line',
    ...DOC_ONLY_RULES.map((entry) => `  ${entry.id} — ${entry.note}`),
    // "0 hits" has two readings — wired-and-clean, or not applying at all.
    // The resolved per-layer view answers which, without print-config
    // archaeology (field issue #7).
    ...(bans.length
      ? [
          '',
          'Per-layer bans — what the structural rules enforce, resolved from this config:',
          ...bans.flatMap((entry) => [
            `  ${entry.layer.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`,
            // The exact strings a merge fold needs — printing them here is
            // what keeps "combine into ONE entry" doable without an emitLint
            // dump (field issue #20). The message caveat closes the follow-up
            // doubt (#23): doctor compares selectors only, by design.
            ...entry.selfOnly.flatMap((ban) => [
              `    selfOnly: no re-export from "${ban.target}" — folding your own`
              + ' no-restricted-syntax into one entry? Copy these selectors verbatim'
              + ' (the message text is yours to write — doctor verifies selectors,'
              + ' never messages):',
              ...ban.selectors.map((selector) => `      ${selector}`),
            ]),
          ]),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ].join('\n');
}
