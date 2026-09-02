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
  toArray,
  unavailableGate,
  unreachedTestGlobs,
  selfOnlyReexportSelector,
  resolveTestFiles,
} from '../emit/lint/patterns';
import type { GateSpec } from '../emit/lint/patterns';
import {
  aliasLayerRoots,
  getForbiddenLayers,
  getSelfOnlyTargets,
  normalizeAllowedImporters, readSetting,
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
   * Why this stack cannot open the gate — absent when it can. It is the difference
   * between this catalog's row count and the `N/M optional gates` denominator, so a
   * reader comparing the two is told which, not left to infer (field run #137).
   */
  unavailable?: string;
  /** The declared setting, resolved — null when the config does not declare it. */
  declared: { tier: string; value?: number } | null;
  /** Whether the emitted config would carry it today. */
  active: boolean;
}

/**
 * What doctor's survival check does NOT compare — one passage, two shapes: the text
 * output prints these lines, `--json` carries them joined into one sentence. Both,
 * because the playbook sends a folding agent to `rules --json` in five places, and
 * a caveat that reaches only the text output comes back as the same doubt from the
 * other channel a few releases later (field issue #117, field run #159).
 *
 * A fact about the check, not "doctor says so" — four of that check's five outcomes
 * print no scope at all, so pointing at its output points at nothing in most repos.
 * Hand-wrapped, and opening on the field name so the text form needs no prefix and
 * the JSON value still reads as a whole sentence. The closing period belongs to the
 * join; `selfOnly[].note` has none because it splices into a parenthetical.
 */
const PACKAGES_NOT_COMPARED = [
  '`packages` is not compared by doctor\'s survival check — a merge that drops a',
  'package ban stays green there, so verify this column yourself with',
  '`npx eslint --print-config <a file in the layer>`.',
];

/**
 * One string for both output shapes, so the text form and `--json` cannot drift
 * apart. It names the fields rather than saying "these": the text reader learns
 * from it which of the two `--json` carries is the one to take.
 */
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
    covers: '../ module escapes at any depth (embedded plugin)',
  },
];

/** A structural rule annotated with whether THIS config's output carries it. */
export interface StructuralStatus extends StructuralRule {
  /** null without a config (static catalog); resolved boolean with one. */
  active: boolean | null;
}

/**
 * Whether each structural rule would appear in the emitted config (issue #14).
 * Mirrors emitLint's conditions from the same primitives — this module must not
 * import lint.ts — so a test pins the mirror to emitLint's real output.
 */
function resolveStructural(blueprint: Blueprint | null): StructuralStatus[] {
  if (!blueprint) {
    return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));
  }

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

  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const packageRules = derivePackageRules(architecture.layers);
  const globalRules = deriveGlobalRules(architecture.layers);

  return architecture.layers.map((layer) => {
    const packages = packageRules
      .filter((rule) => !rule.allowedIn.includes(layer.name))
      .map((rule) => (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package));

    return {
      layer: layer.name,
      forbidden: getForbiddenLayers(architecture, layer.name),
      packages,
      ...(packages.length ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') } : {}),
      globals: globalRules
        .filter((rule) => !rule.allowedIn.includes(layer.name))
        .map((rule) => rule.global),
      selfOnly: getSelfOnlyTargets(architecture, layer.name).map((target) => {
        const selectors = aliases.map((alias) => selfOnlyReexportSelector(alias, target));

        return {
          target,
          selectors,
          // JSON's string escaping IS JavaScript's here, so stringify is the paste
          // form rather than a hand-rolled doubling of backslashes — and it brings
          // the quotes, which is what makes it obvious it is source, not a value.
          jsLiteral: selectors.map((selector) => JSON.stringify(selector)),
          note: SELF_ONLY_MESSAGE_NOTE,
        };
      }),
      testExemptions: resolveTestFiles(architecture.testFiles),
    };
  });
}

/**
 * How this catalog's row count reconciles with the `N/M optional gates` denominator
 * `inspect` and `doctor` print. Two authoritative outputs differing by one, with
 * neither naming the one, is the shape of the defect this closes.
 */
function unavailableNote(gates: GateStatus[]): string {
  const out = gates.filter((gate) => gate.unavailable !== undefined);

  if (!out.length) {
    return ' — all of them openable on this stack, so `inspect` counts the same number';
  }

  return ` — ${out.length} of them unavailable here, which \`inspect\` and \`doctor\` `
    + 'leave out of their optional-gate count';
}

/**
 * Each unavailable gate's cause on a line of its own — the shape `--json` already has,
 * where the reason sits on the gate it belongs to and nothing above them aggregates it.
 * Folded into the count sentence they needed a predicate to share, and the predicate was
 * `on this stack`: true of `explicitAny`, false of a `testFilename` closed by the
 * config's own `testFiles: []`, which is a fact about the config and not about the
 * machine.
 */
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

  // Whether this stack can open the gate at all, from the same function inspect's
  // denominator reads — this used to mirror only the React case, so a JS project saw
  // `explicitAny` here as an ordinary gate and `0/17 optional gates` there, with
  // nothing to reconcile them (field run #137).
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

/**
 * The one thing this catalog reads off the tree, and it decides no gate row: what the
 * declared globs reach is a fact about the exemption, and the gate a dead net still
 * emits is armed over exactly those globs. So the measurement has one destination — a
 * line of its own, the same sentence `inspect` and `deps` print.
 *
 * Unconditional over the dead entries, whether the net still reaches files through
 * another of them or through none. Both states leave the row at `✓`, correctly, so
 * without this line the whole catalog is byte-identical to the same repo with the entry
 * spelled right — which is the wrong green stage 2 was written for, one predicate over.
 */
function measureTestGlobs(root: string, blueprint: Blueprint | null): string | null {
  if (!blueprint) {
    return null;
  }

  const declared = toArray(blueprint.architecture.testFiles);

  // `testFileReach` maps over the DECLARED globs, so with none declared its answer is
  // `[]` whatever the tree holds — and `reactPreset` declares none, which would put every
  // adopter on that shape through a full-tree walk with no sentence to show for it.
  if (!declared.length) {
    return null;
  }

  return unreachedTestGlobs(testFileReach(
    scan(root, blueprint.architecture.sourceRoot),
    declared,
    blueprint.architecture.sourceRoot,
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
          // Both shapes or neither: the playbook sends a folding agent to `rules
          // --json`, and a cause that reaches only the text output comes back as the
          // same doubt from the other channel (field issue #117, field run #159).
          ...(testExemption === null ? {} : { testExemption }),
        }, null, 2)
      : renderRules({ severity, structural, gates, bans, testExemption }, blueprint !== null),
  );

  return { severity, gates, bans };
}

/** The human-readable catalog. */
export function renderRules(
  catalog: {
    severity: string;
    structural: StructuralStatus[];
    gates: GateStatus[];
    bans: LayerBans[];
    /** The dead declared test globs, as one sentence — see `measureTestGlobs`. */
    testExemption?: string | null;
  },
  hasConfig: boolean,
): string {
  const { severity, structural, gates, bans, testExemption } = catalog;

  const status = (gate: GateStatus) => {
    // Outranks the tier, and keeps the declared/undeclared split it used to carry as
    // "never emits here": whether the author set it still matters — declared means a
    // line in their config does nothing, undeclared means adding one would. What the
    // old wording lost is WHY, which the reconciliation line above now names.
    if (gate.unavailable !== undefined) {
      return gate.declared === null ? '· unavailable here' : '· declared, unavailable here';
    }

    if (gate.declared === null) {
      return '· not declared';
    }

    // Declared, not unavailable, and still inactive means exactly one thing: the
    // author set it to off. The other arm this ternary used to have — "declared,
    // never emits here" — existed only for the framework-silenced case, which the
    // unavailable branch above now answers with its reason, so nothing reaches it.
    if (!gate.active) {
      return '· off';
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
    // The row count against inspect's denominator, stated rather than left to
    // subtraction: they differ by exactly the gates that cannot be opened here, and a
    // field agent comparing 18 rows to `0/17 optional gates` had to guess which one
    // and guessed wrong (field run #137).
    `${gates.length} listed${unavailableNote(gates)}`,
    ...unavailableCauses(gates),
    // Beside the reconciliation line, because it is the same kind of fact: something
    // the rows alone cannot show. `·`, the info marker the rows use, and never a ⚠ —
    // one of the two states it covers is a repo doing nothing wrong.
    ...(testExemption ? [`· ${testExemption}`] : []),
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
          'Per-layer bans — what the structural rules enforce, resolved from this config.',
          // Named columns, not "everything below" — doctor's own ✓ says package
          // ownership is NOT compared, so the broader claim put two live outputs in
          // contradiction (field run #159). Unconditional, unlike the `packages`
          // paragraph below: a statement of scope is always true, while an
          // instruction to verify is vacuous when there is nothing to verify.
          '`no-import`, `globals` and the selfOnly selectors are what doctor compares,',
          'and it compares TEXTUALLY: a pattern group reordered or a selector respelled to',
          'an equivalent (`\\/` for `/`) reads as missing even though eslint would still',
          'enforce it. Copy, do not retype.',
          // Only where the column has something in it, same as `--json`. An all-`(none)`
          // column then goes unclassified by the prose, which is the decision: the
          // criterion is whether anything needs verifying, not whether every printed
          // column gets named.
          ...(bans.some((ban) => ban.packages.length) ? PACKAGES_NOT_COMPARED : []),
          ...bans.flatMap((entry) => [
            `  ${entry.layer.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`,
            // The exact strings a merge fold needs, so "combine into ONE entry" is
            // doable without an emitLint dump (field issues #20, #23, #117). The
            // header carries "verbatim"'s reason — doctor's comparison is textual,
            // and without that an agent cannot tell whether an equivalent respelling
            // reads as missing, so it over-constrains defensively (#101).
            ...entry.selfOnly.flatMap((ban) => [
              `    selfOnly: no re-export from "${ban.target}" — folding your own`
              + ' no-restricted-syntax into one entry? Paste these verbatim, quotes'
              + ' included, per the caveat above — they are JS source, not values'
              + ` (${ban.note}):`,
              // The literal, not the value: this line exists to be copied into a
              // config, and the value does not survive that copy (field run #125).
              ...ban.jsLiteral.map((literal) => `      ${literal}`),
              // The selectors alone are not the whole entry. The emitted block
              // exempts the test files these globs reach, and an entry rebuilt from
              // selectors carries no such thing — the merged rule then reaches
              // tests, loudly if a house rule collided there, silently if only
              // blueprint's ban did (field issue #60).
              `      …and carry the exemption the emitted block has for the test files those globs reach: ignores: [${
                entry.testExemptions.map((glob) => `'${glob}'`).join(', ')
              }] — without it your combined entry lints test files that this ban never covered`,
            ]),
          ]),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ].join('\n');
}
