import type {
  ArchitectureDef,
  Framework,
  ModuleDef,
  OwnedPackage,
  OwnedPrimitive,
} from '../../config';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

/**
 * A module's public entry filename. Fixed rather than read from the config: the
 * RFC settles it as `index`, and `layers[].entry` is the unit shape INSIDE a
 * layer — a different thing one level down, which is why this does not borrow it.
 */
const MODULE_ENTRY = 'index';

const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/g;
const MODULE_PLACEHOLDER = /\{\s*module\s*\}/g;

/**
 * Source extensions per framework — the layer-glob default, and the ext set
 * the generated config's guard block scopes to (a react repo's guard used
 * to carry `.vue`, and four field agents hand-trimmed it — issue #30).
 */
export const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

/** The source-root prefix a glob is built on — `''` for a project-root layout. */
function rootPrefix(sourceRoot: string): string {
  return sourceRoot === '.' ? '' : `${sourceRoot}/`;
}

/**
 * The default layer glob for a framework under a given source root. Modular
 * configs carry the module segment ahead of the layer, which is the whole
 * reason an undeclared module is matched by nothing: the product is expanded
 * per declared module, never wildcarded with `*`.
 */
function defaultGlob(framework: Framework, sourceRoot: string, modular: boolean): string {
  const module = modular ? '{module}/' : '';

  return `${rootPrefix(sourceRoot)}${module}{layer}/**/*.{${FRAMEWORK_EXTS[framework]}}`;
}

const DEFAULT_TEST_FILES = [
  '**/*.test.{js,jsx,ts,tsx,vue}',
  '**/*.spec.{js,jsx,ts,tsx,vue}',
];

/** Resolve the test-file globs, defaulting to the `*.test.* / *.spec.*` pair. */
export function resolveTestFiles(testFiles: string | string[] | undefined): string[] {
  return testFiles === undefined ? DEFAULT_TEST_FILES : toArray(testFiles);
}

/**
 * Coerce a `string | string[]` option to an array — and an absent one to none.
 *
 * The `undefined` arm lives here rather than as a `?? []` at each call site. Written
 * there, it decided nothing measurable: the sentinel a mutation puts in its place
 * becomes one more glob, and a glob that matches nothing is indistinguishable from
 * no glob at all. Asked of this function directly, "nothing configured is no globs"
 * has one answer.
 */
export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];

  return Array.isArray(value) ? value : [value];
}

/**
 * The built-in metric gates: rules id → ESLint rule + default threshold.
 * `wrap` marks the rules whose option is `{ max }` with comment skipping.
 */
export const METRIC_GATES = [
  { id: 'maxLines', rule: 'max-lines', fallback: 400, wrap: true },
  { id: 'maxLinesPerFunction', rule: 'max-lines-per-function', fallback: 100, wrap: true },
  { id: 'maxParams', rule: 'max-params', fallback: 3, wrap: false },
  { id: 'maxStatements', rule: 'max-statements', fallback: 15, wrap: false },
  { id: 'complexity', rule: 'complexity', fallback: 12, wrap: false },
] as const;

/**
 * The `statementPadding` gate's option list — hard-wired, not configurable.
 * The gate's dial is its tier: a project that wants different grouping turns
 * it off and declares its own rule, rather than re-specifying 17 entries
 * through `blueprint.rules` (YAGNI — the handbook's own principle).
 */
export const STATEMENT_PADDING = [
  { blankLine: 'always', prev: 'block-like', next: '*' },
  { blankLine: 'always', prev: 'const', next: 'expression' },
  { blankLine: 'always', prev: 'let', next: 'expression' },
  { blankLine: 'always', prev: 'class', next: '*' },
  { blankLine: 'always', prev: 'function', next: '*' },
  { blankLine: 'always', prev: 'multiline-expression', next: '*' },
  { blankLine: 'always', prev: 'multiline-const', next: '*' },
  { blankLine: 'always', prev: 'multiline-let', next: '*' },
  { blankLine: 'always', prev: '*', next: 'block-like' },
  { blankLine: 'always', prev: '*', next: 'function' },
  { blankLine: 'always', prev: '*', next: 'multiline-expression' },
  { blankLine: 'always', prev: '*', next: 'multiline-const' },
  { blankLine: 'always', prev: '*', next: 'multiline-let' },
  { blankLine: 'always', prev: '*', next: 'break' },
  { blankLine: 'always', prev: '*', next: 'continue' },
  { blankLine: 'always', prev: '*', next: 'return' },
  { blankLine: 'always', prev: '*', next: 'throw' },
] as const;

/** One optional gate's catalog row — id, what it emits, and its scope note. */
export interface GateSpec {
  id: string;
  /** The ESLint rule it emits — or the runtime that enforces it instead. */
  emits: string;
  note: string;
  /** Metric fallback threshold, when the gate is one of the metric family. */
  fallback?: number;
  /**
   * Set when a runtime enforces the gate instead of the emitted lint config —
   * machine-gated either way, but "error fails lint" is false for these (#52).
   */
  runtime?: 'inspect';
}

/**
 * The non-metric optional gates, as catalog rows. Both catalog renderings —
 * the authoring playbook and `blueprint rules` — read from here, so the two
 * can never drift apart, and `LINT_GATED_RULE_IDS` derives from it.
 */
export const PLUGIN_GATES: GateSpec[] = [
  { id: 'unusedVars', emits: 'no-unused-vars', note: 'TWO keys on TypeScript — no-unused-vars: off plus @typescript-eslint/no-unused-vars — so check both when merging; argsIgnorePattern \'^_\' and nothing else (no varsIgnorePattern: renaming a dead binding to _x is not deleting it, and the dead-code principle asks for deletion)' },
  { id: 'explicitAny', emits: '@typescript-eslint/no-explicit-any', note: 'needs the injected TS plugin and emits NOTHING without it — `any` is a TS-only construct, so unlike unusedVars there is no core rule to fall back to' },
  { id: 'codeStyle', emits: '@stylistic customize() + @stylistic/max-len + @stylistic/linebreak-style + curly (core)', note: 'needs the injected @stylistic plugin AND its configs.customize() factory (throws on a stand-in, rather than governing nothing); ~68 rules, all but 5 auto-fixable, so `eslint --fix` clears most of a first run — land that pass as its own commit. Knobs: indent (2), quotes (single), semi (true), maxLen (90). max-len has NO fixer and does not exempt plain strings — a long line cannot escape the cap by containing one. linebreak-style is unix: a red here usually means git autocrlf / .gitattributes, NOT the file' },
  { id: 'statementsPerLine', emits: '@stylistic/max-statements-per-line', note: 'needs the injected @stylistic plugin, else emits nothing; hard-wired { max: 1 } because it defines what a line IS for the maxLines family — a line budget with no cap on line content is met by collapsing statements, not by splitting the file. codeStyle\'s bundle carries this rule too; this gate is written after it and wins, so setting it off really turns it off' },
  { id: 'statementPadding', emits: '@stylistic/padding-line-between-statements', note: 'needs the injected @stylistic plugin, else emits nothing; auto-fixable whitespace, and it cannot push a file over maxLines: that gate skips blank lines' },
  { id: 'importBlock', emits: 'import-x/first + import-x/no-duplicates', note: 'needs the injected eslint-plugin-import-x, else emits nothing; catches the two import mistakes an incrementally-editing agent makes — a second import of a module already imported, and an import appended below code. No formatter merges duplicate imports' },
  { id: 'fixtureImports', emits: 'no-restricted-imports', note: 'fixture globs folded into the structural import bans' },
  { id: 'deepWatch', emits: 'blueprint/no-deep-watch', note: 'Vue only — never emits on React' },
  { id: 'usePrefix', emits: 'blueprint/use-prefix', note: 'on its target layer (default hooks)' },
  { id: 'usePrefixReactivity', emits: 'blueprint/use-prefix-needs-reactivity', note: 'composing-only hooks are a known false positive' },
  { id: 'testFilename', emits: 'blueprint/test-filename-matches-source', note: 'test files only' },
  { id: 'typedefOnlyFile', emits: 'blueprint/no-typedef-only-file', note: '.js files only' },
  { id: 'cycles', emits: 'inspect (cycle finding)', runtime: 'inspect', note: 'no ESLint line — import/no-cycle re-checks the whole graph per file, measured 92s on 850 files' },
];

/** Documentation-only ids — never an ESLint line, never a machine gate. */
export const DOC_ONLY_RULES: Omit<GateSpec, 'emits'>[] = [
  { id: 'deadCode', note: 'knip\'s job — import/no-unused-modules cannot run under flat config' },
];

/**
 * The rule ids a machine actually gates out of the box: the metric family and
 * plugin rules land in the emitted ESLint config; `cycles` lands in
 * `inspect` (its `cycle` finding — `import/no-cycle` was dropped from the
 * generated config as a slow re-check of the same graph). Everything else —
 * `deadCode`, unknown ids — is documentation, and the agent contract must not
 * call it a hard gate. Lives in this leaf (not lint.ts) so inspect can count
 * active gates without closing the emit → plugin → inspect module cycle.
 */
export const LINT_GATED_RULE_IDS = [
  ...METRIC_GATES.map((gate) => gate.id),
  ...PLUGIN_GATES.map((gate) => gate.id),
];

/**
 * Why this stack cannot open a gate, or null when it can — mirroring what
 * `emitLint` actually does rather than restating it.
 *
 * One function because there were two, and they disagreed. `inspect` / `doctor`
 * filtered both of these out of the denominator ("a gate you cannot open is not a
 * gate"); `blueprint rules` mirrored only the React one. So a JS repo read
 * `0/17 optional gates` from one output and eighteen rows from the other, with
 * neither saying which was missing — and the field agent who reported it inferred
 * `fixtureImports`, which is not it (field run #137). Two numbers for one concept
 * is a defect whichever is right, and the reader guessing is the cost.
 */
export function unavailableGate(
  id: string,
  framework: string | undefined,
  hasTypescript: boolean,
  testFiles?: string | string[],
): string | null {
  if (id === 'deepWatch' && framework === 'react') {
    return 'Vue only — never emits on React, whatever it declares';
  }

  if (id === 'explicitAny' && !hasTypescript) {
    return '`any` is a TypeScript construct — nothing to catch on a JS project, and no core rule to fall back to';
  }

  // `testFiles: []` is a real intent — tests inherit their layer's rules — and the
  // one this gate has no scope under, since `files: []` is refused by ESLint. Saying
  // so is the other half of dropping the entry (field run #150).
  if (id === 'testFilename' && Array.isArray(testFiles) && testFiles.length === 0) {
    return '`architecture.testFiles: []` exempts nothing, so there is no test file for this to name — declare test globs, or drop this gate';
  }

  return null;
}

/**
 * The same question asked with only a blueprint to answer it — what the two pure
 * emitters have. `hasTypescript` is a fact about the dependency list, so they cannot
 * decide `explicitAny` and must not claim to: `true` here means "assume the stack can
 * carry it", which keeps that gate out of this verdict entirely. Framework and
 * `testFiles` are IN the blueprint, so the other two arms answer honestly.
 *
 * It exists because the emitters had no filter at all: the agent contract listed a gate
 * among the ones that "fail the project's lint run" and the handbook table put `lint` in
 * its Enforced-by column, for a rule the emitted config does not contain. #137 swept
 * `rules` and `inspect`; these two are the third and fourth site, and they are the files
 * an adopting agent actually reads every day.
 */
export function unavailableFromBlueprint(
  id: string,
  framework: string | undefined,
  testFiles: string | string[] | undefined,
): string | null {
  return unavailableGate(id, framework, true, testFiles);
}

/**
 * Which machine actually holds a declared rule id — the distinction
 * `LINT_GATED_RULE_IDS` flattens away, because it answers "gated at all?"
 * rather than "gated by what?". The handbook needs the finer answer: it
 * printed `error` beside every declared rule under a legend reading "`error`
 * fails lint", which is false for `cycles` (inspect's finding) and false for
 * `deadCode` (documentation, knip's job) — two generated artifacts from one
 * source disagreeing (field issue #52).
 */
export function enforcedBy(id: string): 'lint' | 'inspect' | 'docs' {
  const gate = PLUGIN_GATES.find((entry) => entry.id === id);

  if (gate?.runtime) return gate.runtime;

  return LINT_GATED_RULE_IDS.includes(id) ? 'lint' : 'docs';
}

/**
 * One layer's lint file globs inside ONE module — the atom every other file
 * answer is built from. `module` is `undefined` for a flat project, where
 * `src/` is the single implicit module; a `layers: false` module has no layer
 * folders at all and yields none.
 *
 * The per-module set is the atom rather than the product because a ban naming
 * the importing module's own segment cannot be shared across modules: the
 * emitted entry is per (module, layer), and every wider answer below is the
 * union of exactly these.
 *
 * Takes the whole `architecture` rather than the fields it reads: a caller
 * holding `layerFiles` but not `modules` would emit one config and lint a
 * different file set, silently, which is the defect #191 exists to prevent.
 */
export function resolveModuleLayerFiles(
  layer: string,
  module: ModuleDef | undefined,
  architecture: ArchitectureDef,
  framework: Framework,
): string[] {
  const { layerFiles, sourceRoot = 'src', modules } = architecture;

  if (module?.layers === false) return [];

  const globs = layerFiles === undefined
    ? [defaultGlob(framework, sourceRoot, modules !== undefined)]
    : toArray(layerFiles);

  return globs.map((glob) => {
    const withLayer = glob.replace(LAYER_PLACEHOLDER, layer);

    return module === undefined ? withLayer : withLayer.replace(MODULE_PLACEHOLDER, module.name);
  });
}

/**
 * Every file glob a layer covers across the whole project — the product of the
 * declared modules and this layer, expanded per module and never
 * `src/*&#47;<layer>`. A single wildcard would match a module nobody declared
 * (a typo), coverage would count it inside the net, and no module-level rule
 * would govern it.
 */
export function resolveLayerFiles(
  layer: string,
  architecture: ArchitectureDef,
  framework: Framework,
): string[] {
  const { modules } = architecture;

  if (modules === undefined) {
    return resolveModuleLayerFiles(layer, undefined, architecture, framework);
  }

  return layeredModules(modules).flatMap((module) =>
    resolveModuleLayerFiles(layer, module, architecture, framework),
  );
}

/** Modules that carry the layer vocabulary — everything but `layers: false`. */
export function layeredModules(modules: ModuleDef[]): ModuleDef[] {
  return modules.filter((module) => module.layers !== false);
}

/**
 * The module scopes one layer's entries are emitted for: every layered module
 * under `modules`, or the single implicit one a flat project has.
 *
 * The flat arm is `[undefined]` rather than `[]` — a flat project still emits
 * its layer entry, it simply has no module segment to put in the patterns.
 */
export function moduleScopes(architecture: ArchitectureDef): (ModuleDef | undefined)[] {
  const { modules } = architecture;

  return modules === undefined ? [undefined] : layeredModules(modules);
}

/**
 * The alias bases a module's own files address their siblings through —
 * `~app/Fighter` under `modules`, the bare alias in a flat project.
 *
 * One derivation, and its callers are named rather than counted: this doc said
 * "two emitters" while three call sites existed, and a number is what goes
 * stale silently when the fourth arrives.
 *
 * - `emitLint` — the structural pattern groups AND the selfOnly selectors, the
 *   config an adopter's lint run actually enforces
 * - `expectedStructural` — doctor's copy of the same text, compared to the
 *   resolved config by containment
 * - `layerBans` — what `blueprint rules` reports, whose `jsLiteral` field is a
 *   paste source the playbook sends an agent to in four places
 *
 * Scoped in some and not the others, the emitted bans and the reported ones
 * disagree about the same repo: doctor reports a whole layer lost, or an agent
 * pastes a selector that matches nothing and lint stays green over it.
 */
export function scopedAliases(aliases: string[], module: string | undefined): string[] {
  return module === undefined ? aliases : aliases.map((alias) => `${alias}/${module}`);
}

/**
 * The files a module governs that no layer glob covers.
 *
 * For a layered module that is its root — the implicit top layer, where the
 * module's own composition code sits. For a `layers: false` module it is the
 * module entire, since it has no layer globs at all; dropping to root-only
 * there would leave `app/routes/Game.tsx` outside every net, which is the
 * wildcard defect wearing different clothes.
 *
 * Built from `sourceRoot` and the module name at the framework's own source
 * extensions, never by substituting a segment out of a custom `layerFiles`: a
 * custom layer path says nothing reliable about where the module root sits.
 */
export function resolveModuleFiles(
  module: ModuleDef,
  architecture: ArchitectureDef,
  framework: Framework,
): string[] {
  const depth = module.layers === false ? '**/*' : '*';

  return [
    `${rootPrefix(architecture.sourceRoot ?? 'src')}${module.name}/${depth}.{${FRAMEWORK_EXTS[framework]}}`,
  ];
}

/**
 * Every file the emitted config governs: each layer across each module, plus
 * what {@link resolveModuleFiles} covers. The one answer to "which files does
 * this blueprint reach", so the emitted entries, the coverage net and
 * `impact`'s lint targets cannot drift apart (field issue #29 in a new place).
 */
export function resolveGovernedFiles(
  architecture: ArchitectureDef,
  framework: Framework,
): string[] {
  const layers = architecture.layers.flatMap((layer) =>
    resolveLayerFiles(layer.name, architecture, framework),
  );

  const roots = (architecture.modules ?? []).flatMap((module) =>
    resolveModuleFiles(module, architecture, framework),
  );

  return [...new Set([...layers, ...roots])];
}

/**
 * An owner of primitives — a layer, or a module. The two carry the same shape
 * and the same meaning one level apart, so the derivations below are written
 * against the shape rather than duplicated per level: a module's `owns` bans
 * the primitive in every OTHER module exactly as a layer's bans it in every
 * other layer.
 */
export interface PrimitiveOwner {
  name: string;
  owns?: OwnedPrimitive[];
}

/** Group owners' package `owns` by signature; merge which owners allow each. */
export function derivePackageRules<T extends PrimitiveOwner>(layers: T[]): PackageRule[] {
  const byKey = new Map<string, PackageRule>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      if (typeof primitive !== 'string' && 'global' in primitive) continue;

      const pkg: OwnedPackage
        = typeof primitive === 'string' ? { package: primitive } : primitive;

      const key = [
        pkg.package,
        [...(pkg.imports ?? [])].sort().join(','),
        pkg.pattern ? 'glob' : 'path',
        [...(pkg.exempt ?? [])].sort().join(','),
      ].join('|');

      const existing = byKey.get(key);

      if (existing) {
        existing.allowedIn.push(layer.name);
      } else {
        byKey.set(key, {
          package: pkg.package,
          imports: pkg.imports,
          pattern: pkg.pattern,
          exempt: pkg.exempt,
          allowedIn: [layer.name],
        });
      }
    }
  }

  return [...byKey.values()];
}

/** Group owners' global `owns` by name; merge which owners allow each. */
export function deriveGlobalRules<T extends PrimitiveOwner>(layers: T[]): GlobalRule[] {
  const byName = new Map<string, GlobalRule>();

  for (const layer of layers) {
    if (!layer.owns) continue;

    for (const primitive of layer.owns) {
      if (typeof primitive === 'string' || !('global' in primitive)) continue;

      const existing = byName.get(primitive.global);

      if (existing) {
        existing.allowedIn.push(layer.name);
      } else {
        byName.set(primitive.global, { global: primitive.global, allowedIn: [layer.name] });
      }
    }
  }

  return [...byName.values()];
}

/**
 * Build the structural `no-restricted-imports` group patterns for one layer.
 *
 * Closed-world detection (importing an *undeclared* folder) is intentionally
 * absent: ESLint's `group` negation cannot re-include a path once its parent
 * is excluded, so a `~app/** + !~app/{layer}/**` scheme wrongly flags legal
 * imports. That check is deferred to the Verify runtime (S6 `inspect`).
 */
export function buildStructuralPatterns(params: {
  layer: string;
  /**
   * The alias bases these patterns are built on — module-scoped under
   * `modules` (see {@link scopedAliases}), so `~app/Fighter/hooks/**` is what
   * a modular entry bans rather than the `~app/hooks/**` no modular import
   * ever spells.
   */
  aliases: string[];
  forbidden: string[];
  /** The layer's own module layout (drives the same-layer message wording). */
  moduleLayout: 'folder' | 'flat';
  /**
   * Downstream folder-layout layers this layer may import, entry-only. Self and
   * forbidden layers are excluded by the caller — already banned wholesale, and
   * `no-restricted-imports` reports once per group, so overlap double-reports.
   */
  folderTargets?: string[];
  /** Fixture roots barred from production imports (`rules.fixtureImports`). */
  fixtures?: string[];
}): GroupPattern[] {
  const { layer, aliases, forbidden, moduleLayout, folderTargets, fixtures } = params;

  // Escaping the module via `../` cannot be expressed as a literal pattern
  // (it depends on the importing file's depth) — that ban lives in the
  // embedded `blueprint/relative-escape` rule, sharing inspect's resolution.
  const patterns: GroupPattern[] = [
    {
      group: ['./../**', '././**'],
      message:
        '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
    },
    ...aliases.map((a) => ({
      group: [`${a}/${layer}/**`],
      message:
        moduleLayout === 'flat'
          ? `\n🚫 Same-layer imports must be relative. Replace "${a}/${layer}/X" with "./X".`
          // The sibling is reachable, just not by this spelling: one shape for
          // same-layer edges keeps the cycle surface to relative paths alone.
          : `\n🚫 Same-layer imports must be relative. Replace "${a}/${layer}/X" with "../X" `
            + '— its entry only; what is behind the entry stays private.',
    })),
  ];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => aliases.map((a) => `${a}/${banned}/**`)),
      message:
        '\n🚫 This import violates the dependency flow. Only import from allowed lower layers.',
    });
  }

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message:
        '\n🚫 Production code must not import fixtures — missing data renders empty or error, never fake.',
    });
  }

  // Entry-only: no reaching inside a folder-layout module via the alias.
  // `alias/layer/module` (entry) is allowed; a gitignore `/**` matches only
  // *descendants*, so `alias/L/*/**` bans reaching into a module, not the entry.
  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => aliases.map((a) => `${a}/${target}/*/**`)),
      message:
        '\n🚫 Import a module through its entry, not its internals (e.g. "~app/hooks/useX", not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
}

/**
 * The cross-module bans for one importing module, compiled from its own
 * `imports`.
 *
 * **The graph policy is inverted from the layers', and that is the whole
 * point.** A layer defaults to reaching everything downstream and
 * `allowedImporters` narrows it; a module reaches NOTHING until it names a
 * dependency. So this enumerates the modules that are banned rather than the
 * ones that are allowed — built from the declared set minus what this module
 * named, never from a rule about ordering. An implementation that starts from
 * the layer generator rebuilds the permissive default, which is the property
 * the design exists to remove.
 *
 * Two groups, because the remedies differ and `no-restricted-imports` reports
 * once per group:
 *
 * - an undeclared module, banned at its entry AND inside it
 * - a declared one, banned only past its entry — `~app/Combat` resolves,
 *   `~app/Combat/anything` does not
 *
 * A backwards edge needs no group: naming a module declared earlier is
 * rejected by `defineBlueprint`, so no config carrying one is ever emitted.
 * Source importing an earlier module is an ordinary undeclared edge, which is
 * exactly what it is — that edge could never have been declared legally.
 */
export function buildModulePatterns(params: {
  module: ModuleDef;
  modules: ModuleDef[];
  /** Unscoped alias bases — a cross-module address is `~app/<Other>`. */
  aliases: string[];
}): GroupPattern[] {
  const { module, modules, aliases } = params;

  const declared = module.imports ?? [];

  const banned = modules
    .map((entry) => entry.name)
    .filter((name) => name !== module.name && !declared.includes(name));

  const patterns: GroupPattern[] = [];

  if (banned.length) {
    patterns.push({
      // Deduped, because `no-restricted-imports` rejects a duplicate item by
      // failing the WHOLE config to load, not just this entry — and the config
      // it fails to load is the adopter's whole lint run.
      group: dedupe(banned.flatMap((name) => aliases.flatMap((a) => [`${a}/${name}`, `${a}/${name}/**`]))),
      message:
        '\n🚫 This module does not declare that dependency. A module reaches nothing it has not '
        + 'named: add the module to this one\'s `imports` in blueprint.config.mjs, or move the '
        + 'shared part into a module both may reach. Declaring is the owner\'s call, never an '
        + 'adopting agent\'s — and a module may only name modules declared AFTER it, so if the '
        + 'edge runs backwards the decomposition is what needs changing, not the config.',
    });
  }

  if (declared.length) {
    patterns.push({
      // A gitignore `/**` matches descendants only, so the entry itself stays
      // reachable — which is the one address a declared dependency exposes.
      group: dedupe(declared.flatMap((name) => aliases.map((a) => `${a}/${name}/**`))),
      message:
        '\n🚫 Import a module through its entry, not its internals — "~app/Combat", never '
        + '"~app/Combat/hooks/useDamage". What is behind the entry is that module\'s own '
        + 'business, and reaching past it couples you to a decision it never published.',
    });
  }

  return patterns;
}

/** Distinct members, order kept — a duplicate fails the whole config to load. */
function dedupe(globs: string[]): string[] {
  return [...new Set(globs)];
}

/**
 * The module root as a banned import target — the upward edge in its alias
 * spelling. `blueprint/relative-escape` catches the relative one by resolving
 * the path and returns early on any specifier not starting with `.`, so without
 * this the same reach is red in `inspect` and green in lint.
 *
 * **`paths`, not a pattern group, and that is the whole design.** A group is
 * gitignore-matched: `~app/Fighter` bans `~app/Fighter/hooks/useX` too, which
 * would cut the module off from its own layers — governed already, by the
 * same-layer and forbidden-layer groups, with the messages that fit. `paths`
 * entries match the specifier exactly, which is what "the root, and nothing
 * under it" needs. Measured against the real linter, not inferred.
 *
 * Both spellings, because they are one reach: the module folder, and its entry
 * named outright.
 *
 * Narrower than `inspect`, deliberately and unavoidably: `analyze` reports any
 * non-layer segment under the own module, a root component included
 * (`~app/Fighter/Fighter`). No `no-restricted-imports` shape expresses that —
 * a group cannot re-include the layers once the module is excluded, and `paths`
 * cannot enumerate filenames the config never sees. So lint carries the two
 * named spellings and `inspect` stays the wider gate.
 */
export function moduleRootPaths(aliases: string[], module: string | undefined): PathPattern[] {
  if (module === undefined) return [];

  const message
    = '\n🚫 This reaches up to the module root. The root composes the layers, so nothing inside '
      + 'one may import back up to it — move the shared part down into a layer, or pass it in '
      + 'from the root.';

  return [...new Set(aliases.flatMap((a) => [a, `${a}/${MODULE_ENTRY}`]))]
    .map((name) => ({ name, message }));
}

/** Split disabled package rules into `no-restricted-imports` paths + patterns. */
export function buildPackagePatterns(disabled: PackageRule[]): {
  paths: PathPattern[];
  patterns: GroupPattern[];
} {
  const message = (pkg: PackageRule) =>
    pkg.imports?.length
      ? `\n🚫 Do not import ${pkg.imports.join(', ')} from "${pkg.package}" in this layer.`
      : `\n🚫 Do not import "${pkg.package}" in this layer.`;

  return {
    paths: disabled
      .filter((rule) => !rule.pattern)
      .map((rule) => ({ name: rule.package, importNames: rule.imports, message: message(rule) })),
    patterns: disabled
      .filter((rule) => rule.pattern)
      .map((rule) => ({
        group: [rule.package],
        importNames: rule.imports,
        message: message(rule),
      })),
  };
}

/**
 * Build the `no-restricted-syntax` selector banning re-export of a selfOnly
 * target. `/` is encoded as the `\u002F` regex escape: esquery's regex
 * literal ends at the first raw `/`, and versions below 1.7 reject the
 * `\/` escape too — truncating the pattern and crashing ESLint on every
 * file of the layer (field issue #19) — while `\u002F` parses on every
 * version and still means `/` to the RegExp.
 */
export function selfOnlyReexportSelector(alias: string, target: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\u002F');
  const attr = `[source.value=/^${esc(alias)}\\u002F${esc(target)}\\u002F/]`;

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}
