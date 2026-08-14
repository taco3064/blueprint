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
  moduleRootPaths,
  PLUGIN_GATES,
  scopedAliases,
  unavailableGate,
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
import type { Blueprint, LayerDef, ModuleDef } from '../config';
import { moduleZone, zoneWord } from './zone';

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
interface BansCommon {
  /**
   * The module this entry governs, absent on a flat config. Present because the
   * emitted entry is per (module, layer): without it, two modules' rows print
   * and serialize identically while carrying different selectors, and the
   * reader cannot tell which one they are meant to paste.
   */
  module?: string;
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
   * reaching test files (field issue #60) — carry them wherever the selectors land.
   */
  testExemptions: string[];
  /**
   * Exact specifiers banned as `paths` rather than patterns — the module root,
   * in both its spellings. Reported apart from `no-import` because it is a
   * different mechanism in the emitted entry, and a fold that rebuilds it as a
   * pattern group takes the module's own layers with it.
   */
  moduleRoot: string[];
}

/**
 * One emitted entry's resolved bans.
 *
 * `zone` discriminates the row: one per (module, layer), one for a layered
 * module's own root, one for the whole net of a `layers: false` module. A union
 * rather than an optional `layer`, because a reader is told to paste from here
 * — a key that is merely absent reads as one the config failed to name, and
 * narrowing on `zone` hands a consumer the layer wherever there is one.
 */
export type LayerBans
  = | (BansCommon & { zone: 'layer'; layer: string })
    | (BansCommon & { zone: 'root' | 'module'; layer?: undefined });

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
  { rule: 'no-restricted-imports', covers: 'dependency flow, same-layer bans, package ownership — whole packages or named imports ({ package, imports }); same-signature owns merge — and fixture bans' },
  { rule: 'no-restricted-syntax', covers: 'selfOnly re-export bans — emitted only when an allowedImporters ENTRY declares selfOnly: true (a layer-level selfOnly key is invalid)' },
  { rule: 'no-restricted-globals', covers: 'global ownership (owns: [{ global: … }]) — emitted only where some layer is barred from an owned global' },
  { rule: 'blueprint/relative-escape', covers: '../ module escapes at any depth (embedded plugin)' },
  { rule: 'blueprint/no-module-root-import', covers: 'a layer reaching up to its own module root at any alias spelling — emitted only under architecture.modules, on a module\'s LAYER entries. The two spellings a config can name ride the entry\'s `paths` list; this covers the rest, including the root component\'s own filename, which no pattern or path can enumerate (embedded plugin)' },
  { rule: 'blueprint/no-module-reexport', covers: 'passing another module\'s public surface through this one\'s — emitted only under architecture.modules, and it follows the local BINDING, so the two-statement spelling and every rename are the same violation (embedded plugin)' },
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
  if (!blueprint) return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));

  const { layers } = blueprint.architecture;
  const globalRules = deriveGlobalRules(layers);

  const active: Record<string, boolean> = {
    'no-restricted-imports': true,
    'blueprint/relative-escape': true,
    // Only a modular config has another module to forward, and emitLint emits
    // the rule on exactly that condition.
    'blueprint/no-module-reexport': blueprint.architecture.modules !== undefined,
    // Same condition: only a modular config has a module root to reach up to.
    'blueprint/no-module-root-import': blueprint.architecture.modules !== undefined,
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

/**
 * Every emitted entry's resolved bans, from the same primitives emitLint uses —
 * one per (module, layer) under `architecture.modules`, one per layer on a flat
 * config, because that is what the emitted config holds.
 *
 * The third emitter of a module-scoped address, beside the structural pattern
 * groups and the selfOnly selectors. It joins them rather than deriving the
 * address again: `jsLiteral` exists to be pasted into a hand-merged config, so
 * an unscoped selector here is not a stale report but a dead rule the adopter
 * installed on this command's instruction, with lint green over it.
 */
function layerBans(blueprint: Blueprint): LayerBans[] {
  const { architecture } = blueprint;

  const roots = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const packageRules = derivePackageRules(architecture.layers);
  const globalRules = deriveGlobalRules(architecture.layers);

  // The same two derivations one level up, exactly as emitLint has them: a
  // file answers to the layer it sits in AND the module that contains it.
  //
  // undecidable, the `?? []` arm, same as emitLint's copy: a fabricated member is
  // a string, so both derivations read its `owns` as `undefined` and derive
  // nothing. It stays because the absent arm is real — a flat config reaches
  // here — and because `barred` leans on this list being empty there.
  const modules = architecture.modules ?? [];
  const modulePackages = derivePackageRules(modules);
  const moduleGlobals = deriveGlobalRules(modules);

  const named = (rule: { package: string; imports?: string[] }): string =>
    (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package);

  // undecidable, the `owner === undefined` test, and shielded by ONE line above:
  // `const modules = architecture.modules ?? []` is what makes `modulePackages`
  // and `moduleGlobals` empty on a flat config, so the filter answers `[]` there
  // however this compares. Give that default anything but an empty list and this
  // proof is void. The test stays because it is what lets `owner` be read as a
  // string — emitLint's `ownedElsewhere` is the same pair, one module over.
  const barred = <T extends { allowedIn: string[] }>(rules: T[], owner: string | undefined): T[] =>
    (owner === undefined ? [] : rules.filter((rule) => !rule.allowedIn.includes(owner)));

  const layerRow = (module: ModuleDef | undefined, layer: LayerDef): LayerBans => {
    const aliases = scopedAliases(roots, module?.name);

    const packages = [
      ...packageRules.filter((rule) => !rule.allowedIn.includes(layer.name)),
      ...barred(modulePackages, module?.name),
    ].map(named);

    return {
      zone: 'layer',
      layer: layer.name,
      // Omitted rather than null on a flat config: there is no module, and a
      // key holding "no module" would read as one the config failed to name.
      ...(module ? { module: module.name } : {}),
      forbidden: getForbiddenLayers(architecture, layer.name),
      packages,
      ...(packages.length ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') } : {}),
      globals: [
        ...globalRules.filter((rule) => !rule.allowedIn.includes(layer.name)),
        ...barred(moduleGlobals, module?.name),
      ].map((rule) => rule.global),
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
      moduleRoot: moduleRootPaths(aliases, module?.name).map((entry) => entry.name),
    };
  };

  /**
   * The entry for the zone no layer glob reaches — a layered module's own root,
   * or the whole net of a `layers: false` one.
   *
   * It carries no layer, which is why the row is discriminated by `zone` rather
   * than by an absent `layer`: a reader pasting from this table has to know
   * which entry a row belongs to, and a missing key reads as one the config
   * failed to name rather than as one it does not have.
   */
  const zoneRow = (module: ModuleDef): LayerBans => ({
    zone: moduleZone(module),
    module: module.name,
    // The root composes this module's layers, so it may reach every one of
    // them; a `layers: false` module has no layer flow at all.
    forbidden: [],
    packages: barred(modulePackages, module.name).map(named),
    ...(barred(modulePackages, module.name).length
      ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') }
      : {}),
    globals: barred(moduleGlobals, module.name).map((rule) => rule.global),
    // No selfOnly selector is emitted for this zone: `allowedImporters` is a
    // layer's field, and this entry governs files that sit in no layer.
    selfOnly: [],
    testExemptions: resolveTestFiles(architecture.testFiles),
    // Nor a module-root ban: this entry IS the module root, and the rule it
    // carries is about reaching UP to it from a layer.
    moduleRoot: [],
  });

  if (architecture.modules === undefined) {
    return architecture.layers.map((layer) => layerRow(undefined, layer));
  }

  // Grouped by module, each module's layer entries followed by its own zone —
  // the order a reader folding one module's entries needs them in.
  return architecture.modules.flatMap((module) => [
    ...(module.layers === false ? [] : architecture.layers.map((layer) => layerRow(module, layer))),
    zoneRow(module),
  ]);
}

/** A ban row's address: `Fighter/hooks` under modules, `hooks` on a flat config. */
function banLabel(entry: LayerBans): string {
  // Named for what the entry governs, not for a layer it does not have: the
  // module's own root files, or every file in a module that declared none.
  const own = entry.zone === 'layer' ? entry.layer : `(${zoneWord(entry.zone)})`;

  return entry.module === undefined ? own : `${entry.module}/${own}`;
}

/**
 * Whether these rows are addressed by module. True of every row or of none:
 * `layerBans` builds them from one scope set, so the shape is homogeneous.
 *
 * One function because the heading and the column width are the same question,
 * and written twice they can answer it differently.
 *
 * undecidable, `some` against `every`: the two differ only on an empty list,
 * and both callers sit inside the `bans.length` guard. `layerBans` cannot
 * return an empty list anyway — `architecture.layers` is rejected empty at
 * config load, and `moduleScopes` answers `[undefined]` at worst.
 */
function addressedByModule(bans: LayerBans[]): boolean {
  return bans.some((entry) => entry.module !== undefined);
}

/**
 * The label column's width. A module label is `Fighter/contexts` — longer than
 * the layer names this column was sized for, so a fixed width leaves a modular
 * table stepping raggedly around the longest name.
 *
 * Widened only where a module is present. Measured on a flat config too, the
 * width would come from its own longest layer name, and every row of a config
 * with a name past the old fixed 14 would shift — a table nobody asked to move,
 * on the shape this change is supposed to leave alone.
 */
function banWidth(bans: LayerBans[]): number {
  const fixed = 14;

  if (!addressedByModule(bans)) return fixed;

  return Math.max(fixed, ...bans.map((entry) => banLabel(entry).length));
}

/**
 * How this catalog's row count reconciles with the `N/M optional gates` denominator
 * `inspect` and `doctor` print. Two authoritative outputs differing by one, with
 * neither naming the one, is the shape of the defect this closes.
 */
function unavailableNote(gates: GateStatus[]): string {
  const out = gates.filter((gate) => gate.unavailable !== undefined);

  if (!out.length) return ' — all of them openable on this stack, so `inspect` counts the same number';

  return ` — ${out.length} of them unavailable on this stack (${
    out.map((gate) => `${gate.id}: ${gate.unavailable}`).join('; ')
  }), which \`inspect\` and \`doctor\` leave out of their optional-gate count`;
}

function resolveGate(
  spec: GateSpec,
  blueprint: Blueprint | null,
  hasTypescript: boolean,
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
  const unavailable = unavailableGate(
    spec.id,
    blueprint?.framework,
    hasTypescript,
    blueprint?.architecture.testFiles,
  );

  return {
    ...spec,
    declared,
    ...(unavailable !== null ? { unavailable } : {}),
    active: declared !== null && declared.tier !== 'off' && unavailable === null,
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
  const gates = gateSpecs().map((spec) => resolveGate(spec, blueprint, state.hasTypescript));
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
    // Outranks the tier, and keeps the declared/undeclared split it used to carry as
    // "never emits here": whether the author set it still matters — declared means a
    // line in their config does nothing, undeclared means adding one would. What the
    // old wording lost is WHY, which the reconciliation line above now names.
    if (gate.unavailable !== undefined) {
      return gate.declared === null ? '· unavailable here' : '· declared, unavailable here';
    }

    if (gate.declared === null) return '· not declared';

    // Declared, not unavailable, and still inactive means exactly one thing: the
    // author set it to off. The other arm this ternary used to have — "declared,
    // never emits here" — existed only for the framework-silenced case, which the
    // unavailable branch above now answers with its reason, so nothing reaches it.
    if (!gate.active) return '· off';

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
    // subtraction: they differ by exactly the gates this stack cannot open, and a
    // field agent comparing 18 rows to `0/17 optional gates` had to guess which one
    // and guessed wrong (field run #137).
    `${gates.length} listed${unavailableNote(gates)}`,
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
          // The heading names the granularity the rows below actually have, and
          // it is not the same on both shapes: under modules the emitted config
          // holds one entry per (module, layer), so a heading saying "per-layer"
          // over `Fighter/hooks` rows describes a config the reader does not have.
          addressedByModule(bans)
            ? 'Bans per module × layer — what the structural rules enforce, resolved from this'
            + ' config. Each row is one emitted entry, and the selectors under it are that'
            + ' module\'s: a module is isolated by default, so its neighbour\'s row is a'
            + ' different string and not a copy of this one.'
            : 'Per-layer bans — what the structural rules enforce, resolved from this config.',
          // Named columns, not "everything below" — doctor's own ✓ says package
          // ownership is NOT compared, so the broader claim put two live outputs in
          // contradiction (field run #159). Unconditional, unlike the `packages`
          // paragraph below: a statement of scope is always true, while an
          // instruction to verify is vacuous when there is nothing to verify.
          '`no-import`, `globals`, `module-root` and the selfOnly selectors are the columns'
          + ' doctor compares — along with the embedded `blueprint/*` rules, which are not a'
          + ' column here,',
          'and it compares TEXTUALLY: a pattern group reordered or a selector respelled to',
          'an equivalent (`\\/` for `/`) reads as missing even though eslint would still',
          'enforce it. Copy, do not retype.',
          // Only where the column has something in it, same as `--json`. An all-`(none)`
          // column then goes unclassified by the prose, which is the decision: the
          // criterion is whether anything needs verifying, not whether every printed
          // column gets named.
          ...(bans.some((ban) => ban.packages.length) ? PACKAGES_NOT_COMPARED : []),
          ...bans.flatMap((entry) => [
            // `Fighter/hooks`, so the row names the entry it came from.
            `  ${banLabel(entry).padEnd(banWidth(bans))} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`
            // Its own column, because it is a `paths` entry in the emitted
            // rule and not a pattern group: rebuilt as a group in a hand-fold
            // it would ban the module's own layers from each other.
            + (entry.moduleRoot.length
              ? ` · module-root (exact paths, never a group): ${entry.moduleRoot.join(', ')}`
              : ''),
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
              // exempts test files, and an entry rebuilt from selectors carries
              // no such thing — the merged rule then reaches tests, loudly if a
              // house rule collided there, silently if only blueprint's ban did
              // (field issue #60).
              `      …and carry the exemption the emitted block has: ignores: [${
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
