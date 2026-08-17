import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
// Import from the patterns / gates / bans / nets leaves, not the emit/lint index —
// the index also exports lint.ts, which loads the plugin, which shares resolve
// logic with inspect; routing through the index would close a module cycle.
import {
  DOC_ONLY_RULES,
  METRIC_GATES,
  PLUGIN_GATES,
  unavailableGate,
} from '../emit/lint/gates';
import type { GateSpec } from '../emit/lint/gates';
// `bans.ts` is the same resolver `emitLint` itself compiles the emitted
// patterns from — `resolveBanScope` derives `packageRules` / `globalRules`
// from layers AND modules together exactly once, and `barredIn` is the same
// ownership check a net's real rules are filtered by, so the catalog and the
// emitted config can never independently drift about who owns what.
import {
  barredIn,
  netModuleSelfOnly,
  netSelfOnly,
  resolveBanScope,
} from '../emit/lint/bans';
import { netLabel, resolveFileNets } from '../emit/lint/nets';
import type { NetScope } from '../emit/lint/nets';
import {
  resolveTestFiles,
  selfOnlyModuleReexportSelector,
  selfOnlyReexportSelector,
} from '../emit/lint/patterns';
import {
  getForbiddenLayers,
  getForbiddenModules,
  getModules,
  normalizeAllowedImporters,
  normalizeModuleAllowedImporters,
  readSetting,
} from '../config';
import type { Blueprint } from '../config';

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
 * One governed file group's resolved bans — what the structural rules actually
 * enforce there. Field agents answered "is the rule really wired?" by parsing
 * `eslint --print-config` output by hand (issue #7); this is that view,
 * derived from the same primitives emitLint compiles from.
 *
 * One row per NET, which under the flat structure is one row per layer and
 * nothing has moved. `layer` + `module` together are `NetScope`, deliberately:
 * this view answers what a group of files may do, and that is the unit emitLint
 * writes an entry for.
 */
export interface LayerBans {
  /**
   * The layer these files sit in, or null when the group belongs to no layer:
   * a module's own root files, or a `layers: false` module holding its files
   * directly. Null is not "unknown" — those groups carry real bans (the
   * same-module root restriction, and any package/global their module does not
   * own), and omitting them reported a `layers: false` module in no section of
   * this catalog at all.
   */
  layer: string | null;
  /**
   * The feature module this row's files sit in, or null under the flat
   * structure. A shared layer nested inside more than one module (every
   * `layers !== false` module reuses the same declared layer set) gets one
   * row per module rather than one merged row — package/global ownership can
   * cascade differently per module, and a single bare-name row could not show
   * "not banned inside the owning module" and "still banned in a different
   * one" at the same time.
   */
  module: string | null;
  /**
   * Layers this one must not import. Empty for a no-layer group: it sits at no
   * layer, so it has no layer-flow edge to violate — what constrains it is the
   * module axis (`ModuleBans`) and the same-module root restriction.
   */
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
   * The selfOnly re-export bans on this group's files — the exact
   * `no-restricted-syntax` selector per (target, alias), for BOTH axes: a layer
   * this group's layer may depend on but not re-export, and a module its module
   * may depend on but not re-export.
   *
   * Per net, not per bare layer name, and that is load-bearing rather than tidy:
   * inside a module the target sits one segment deeper, so the layer selector is
   * anchored on `alias/Module/target` — a bare `alias/target` pasted into a
   * modular repo's config matches no file it was meant to guard and silently
   * protects nothing. The module-axis targets need the OTHER builder again
   * ({@link selfOnlyModuleReexportSelector}), which also matches the module's
   * bare entry spelling. Both come from `emit/lint/bans.ts`, the same functions
   * `emitLint` emits from and `doctor` compares against.
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
}

/**
 * One declared module's resolved flow bans — the module-axis twin of `LayerBans`,
 * from the same primitive `emitLint` reads (`getForbiddenModules`). Empty under
 * the flat structure: no `architecture.modules`, nothing to report here.
 *
 * The two views split by what varies, not by axis. `LayerBans` is the net-scoped
 * catalog — one row per governed group — because its columns genuinely differ
 * between nets: the ownership cascade answers differently for a layer inside the
 * owning module than for the same layer inside a sibling, and a selfOnly selector
 * is anchored on the module whose files it guards. A module's flow bans do not
 * vary that way: every net inside `Combat` carries the identical "may not import
 * Shell", so stating it per net would be one fact restated N times. This column
 * answers it once, keyed by bare module name.
 */
export interface ModuleBans {
  module: string;
  /** Modules this one must not import at all. */
  forbidden: string[];
}

/** Every declared module's resolved flow bans, from the same primitive emitLint uses. */
function moduleBans(blueprint: Blueprint): ModuleBans[] {
  const { architecture } = blueprint;

  return getModules(architecture).map((module) => ({
    module: module.name,
    forbidden: getForbiddenModules(architecture, module.name),
  }));
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
    covers: '../ folder escapes at any depth (embedded plugin)',
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
 *
 * `no-restricted-syntax` and `no-restricted-globals` used to read `architecture.layers`
 * alone: a selfOnly importer or an owned global declared only on a MODULE (stage 2's
 * own cascade) never flipped either flag, so `rules --json` reported `active: false`
 * for a rule `emitLint` was already emitting — the exact "consumers and the emitter
 * disagree" gap stage 3 promised to close. Both now read the combined layer+module
 * facts `resolveBanScope` already resolves for the emitted config itself.
 */
function resolveStructural(blueprint: Blueprint | null): StructuralStatus[] {
  if (!blueprint) {
    return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));
  }

  const { architecture, framework } = blueprint;
  const modules = getModules(architecture);
  const scope = resolveBanScope(blueprint);
  const nets = resolveFileNets(architecture, framework);

  const layerSelfOnly = architecture.layers.some((layer) =>
    normalizeAllowedImporters(layer.allowedImporters)
      .some((importer) => importer.selfOnly === true));

  const moduleSelfOnly = modules.some((module) =>
    normalizeModuleAllowedImporters(module.allowedImporters)
      .some((importer) => importer.selfOnly === true));

  const active: Record<string, boolean> = {
    'no-restricted-imports': true,
    'blueprint/relative-escape': true,
    'no-restricted-syntax': layerSelfOnly || moduleSelfOnly,
    // Active where SOME net is barred from SOME owned global — an owner
    // whose cascade reaches every net (a layer, or a module covering every
    // layer nested inside it) leaves nothing left to restrict.
    'no-restricted-globals': scope.globalRules.some((rule) =>
      nets.some((net) => barredIn(net, rule))),
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
 * Every declared layer's resolved bans, from the same primitives emitLint uses —
 * one row per NET rather than one per bare layer name: flat, that is unchanged
 * (one row per layer, `module: null`); modular, a shared layer nested inside
 * several modules gets one row per module, because `barredIn` can answer
 * differently for each — a module that owns a package cascades it to every
 * layer nested inside it, and a sibling module that does not own it still
 * bars the very same bare layer name. `packageRules` / `globalRules` come
 * from `resolveBanScope`, derived from layers AND modules together exactly
 * once — the same facts `emitLint` filters each net's rules from.
 */
function layerBans(blueprint: Blueprint): LayerBans[] {
  const { architecture, framework } = blueprint;
  const scope = resolveBanScope(blueprint);
  const { packageRules, globalRules } = scope;

  return resolveFileNets(architecture, framework).map((net) => {
    const packages = packageRules
      .filter((rule) => barredIn(net, rule))
      .map((rule) => (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package));

    return {
      layer: net.layer,
      module: net.module,
      // A no-layer group sits at no layer, so it has no layer-flow edge —
      // exactly what `moduleLayerScope` gives it (`forbidden: []`).
      forbidden: net.layer === null ? [] : getForbiddenLayers(architecture, net.layer),
      packages,
      ...(packages.length ? { packagesNote: PACKAGES_NOT_COMPARED.join(' ') } : {}),
      globals: globalRules
        .filter((rule) => barredIn(net, rule))
        .map((rule) => rule.global),
      selfOnly: netSelfOnlyBans(net, scope),
      testExemptions: resolveTestFiles(architecture.testFiles),
    };
  });
}

/**
 * One net's selfOnly re-export bans, both axes, in the exact spelling `emitLint`
 * emits — `netSelfOnly` carries the module-prefixed path a layer target is really
 * reached at, and `netModuleSelfOnly` the module targets, which need the selector
 * that also matches a module's bare entry. Deriving either by hand from the bare
 * layer name is how this column came to print a selector no modular repo has a
 * file for.
 */
function netSelfOnlyBans(
  net: NetScope,
  scope: ReturnType<typeof resolveBanScope>,
): LayerBans['selfOnly'] {
  const { architecture, aliases } = scope;

  const entries = [
    ...netSelfOnly(net, architecture).map(({ target, path }) => ({
      target,
      selectors: aliases.map((alias) => selfOnlyReexportSelector(alias, path)),
    })),
    ...netModuleSelfOnly(net, architecture).map(({ target, path }) => ({
      target,
      selectors: aliases.map((alias) => selfOnlyModuleReexportSelector(alias, path)),
    })),
  ];

  return entries.map(({ target, selectors }) => ({
    target,
    selectors,
    // JSON's string escaping IS JavaScript's here, so stringify is the paste
    // form rather than a hand-rolled doubling of backslashes — and it brings
    // the quotes, which is what makes it obvious it is source, not a value.
    jsLiteral: selectors.map((selector) => JSON.stringify(selector)),
    note: SELF_ONLY_MESSAGE_NOTE,
  }));
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
  const unavailable = unavailableGate(spec.id, {
    framework: blueprint?.framework,
    hasTypescript,
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
): Promise<{ severity: string; gates: GateStatus[]; bans: LayerBans[]; modules: ModuleBans[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  const blueprint = state.hasConfig
    ? (await resolveBlueprint(root, state, options)).blueprint
    : null;

  const severity = blueprint?.emit?.lint?.severity ?? 'error';
  const structural = resolveStructural(blueprint);
  const gates = gateSpecs().map((spec) => resolveGate(spec, blueprint, state.hasTypescript));
  const bans = blueprint ? layerBans(blueprint) : [];
  const modules = blueprint ? moduleBans(blueprint) : [];

  log(
    options.json
      ? JSON.stringify({
          severity,
          structural,
          gates,
          bans,
          modules,
          docsOnly: DOC_ONLY_RULES,
        }, null, 2)
      : renderRules({ severity, structural, gates, bans, modules }, blueprint !== null),
  );

  return { severity, gates, bans, modules };
}

/** The human-readable catalog. */
export function renderRules(
  catalog: {
    severity: string;
    structural: StructuralStatus[];
    gates: GateStatus[];
    bans: LayerBans[];
    modules: ModuleBans[];
  },
  hasConfig: boolean,
): string {
  const { severity, structural, gates, bans, modules } = catalog;

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
          // What a bare-module row IS — said here rather than crammed into the label,
          // because the two shapes that produce one are not distinguishable from the
          // row itself and a label claiming "root" would be wrong for the second.
          // Only on a modular blueprint: under the flat structure no such row exists,
          // and a paragraph about a row shape nobody has is noise (the same criterion
          // the `packages` caveat below is gated on).
          ...(bans.some((ban) => ban.layer === null)
            ? [
                'A row keyed by a bare module name is that module\'s own file group — its root',
                'files when the module nests the shared layers, the whole module when it',
                'declares `layers: false`. Its `no-import` is always (none): it sits at no',
                'layer, so what constrains it is the module axis below plus the same-module',
                'rule that its own files be reached relatively, never through the alias.',
              ]
            : []),
          // Only where the column has something in it, same as `--json`. An all-`(none)`
          // column then goes unclassified by the prose, which is the decision: the
          // criterion is whether anything needs verifying, not whether every printed
          // column gets named.
          ...(bans.some((ban) => ban.packages.length) ? PACKAGES_NOT_COMPARED : []),
          ...bans.flatMap((entry) => [
            // Module-qualified once nested, through the same `netLabel` doctor names a
            // lost net by: the same bare layer name can carry a different cascade per
            // module, and an unqualified row would silently pick one and hide the
            // other (see `LayerBans.module`'s own doc comment). Two spellings of one
            // net's name is a bridge the reader doctor sent here has to build.
            `  ${netLabel(entry).padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
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
    // Empty under the flat structure — no `architecture.modules`, nothing to
    // report here, and the layer table above stays the report's last section.
    ...(modules.length
      ? [
          '',
          'Per-module bans — the module-axis flow this blueprint declares, from the same',
          'primitive the per-layer bans above read (`getForbiddenModules`). Doctor\'s survival',
          'check DOES compare these: it probes one file per governed net, and every net inside',
          'a module carries that module\'s flow bans, so a merge that drops one turns red there',
          'under the net\'s own name. Its remaining blind spot on this axis is narrower — the',
          'same-module rule\'s bare-entry half (`~app/<module>` itself, emitted as an exact',
          '`paths` entry, and the check reads `patterns` only). That half is what',
          '`npx eslint --print-config <a file at the module\'s own root>` is still for.',
          ...modules.map((entry) =>
            `  ${entry.module.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ].join('\n');
}
