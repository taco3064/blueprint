import type { ESLint, Linter } from 'eslint';

/** One entry of an ESLint flat config — a drop-in for `eslint.config.js`. */
export interface LintConfigEntry {
  files?: string[];
  ignores?: string[];
  /** Parser wiring — emitted rules never set this; `impact` builds parser entries with it. */
  languageOptions?: Linter.LanguageOptions;
  linterOptions?: Linter.LinterOptions;
  /** The embedded plugin, carried along when an entry uses a `blueprint/*` rule. */
  plugins?: Record<string, ESLint.Plugin>;
  rules?: Linter.RulesRecord;
}

/** The ESLint flat config emitted from a Blueprint's architecture. */
export type LintConfig = LintConfigEntry[];

/** Caller-supplied wiring for `emitLint` — kept injectable so the library stays zero-dependency. */
export interface EmitLintOptions {
  /**
   * The `@typescript-eslint` plugin (e.g. `tseslint.plugin`). When provided,
   * the `unusedVars` gate emits `@typescript-eslint/no-unused-vars` instead of
   * core `no-unused-vars`, whose TS blind spots false-flag enum members and
   * type parameters. Also the carrier for the `explicitAny` gate, which has no
   * core twin at all — without this, that gate emits nothing.
   */
  typescript?: ESLint.Plugin;
  /**
   * The `@stylistic/eslint-plugin`. Carrier for the shape family
   * (`codeStyle`, `statementsPerLine`, `statementPadding`) — ESLint's own
   * formatting rules were deprecated and frozen when it handed them to
   * `@stylistic`, so emitting the core ids would ship rules slated for
   * removal. Without this, all three gates emit nothing. `codeStyle`
   * additionally needs the real plugin's `configs.customize()` factory.
   */
  stylistic?: ESLint.Plugin;
  /**
   * The `eslint-plugin-import-x` plugin. Carrier for `importBlock`
   * (`import-x/first` + `import-x/no-duplicates`) — nothing in ESLint core
   * or `@stylistic` merges duplicate imports, and both mistakes are ones an
   * agent editing incrementally makes routinely. Without this, the gate
   * emits nothing.
   *
   * `-x` rather than `eslint-plugin-import`, whose peer range stops at
   * ESLint 9 (field issue #37) — it cannot be installed at all on the
   * ESLint 10 baseline this package now targets.
   *
   * It replaced `eslint-plugin-import-lite`, which was chosen when the
   * baseline still included repos that import-x could not install into: it
   * peers on `@typescript-eslint/utils@^8.56` for its resolvers, and a repo
   * pinned below that failed adoption outright (field issue #41). On an
   * ESLint 10 baseline that repo does not exist — nothing resolves ESLint 10
   * while holding typescript-eslint below 8.56 — so the trade reverses: the
   * resolvers stop being dead weight and become the reason to take it.
   *
   * What they buy is the whole-graph family import-lite structurally could
   * not carry, `no-cycle` above all. This package does not emit it: cycles
   * are a graph property and `inspect` already walks that graph once, where
   * a per-file rule re-walks it for every file. But a project that wants the
   * cycle red at edit time can now reach for it without adding a plugin —
   * see the gate catalog for the `ignoreExternal` setting that keeps the
   * walk inside its own source.
   */
  imports?: ESLint.Plugin;
  /**
   * The absolute directory the project's own files start under — in the emitted
   * config, `dirname(fileURLToPath(import.meta.url))`, since that file sits at
   * the project root.
   *
   * Without it the relative-import rule has only the layer NAME to anchor on,
   * and a directory above the project called `components` (or any other declared
   * layer) is read as that layer: the rule then judges every relative import in
   * the wrong coordinates and, in the case that started this, reports nothing at
   * all while `inspect` reports the same file as a `layer-escape`. A
   * `sourceRoot` of `.` has no other anchor, and a named root has the same hole
   * under an ancestor spelling `<sourceRoot>/<layer>`, so this is not a `.`-only
   * option.
   *
   * It cannot be inferred inside the rule: eslint gives a rule `cwd`, which
   * moves to wherever the linter was invoked from, and never the config file's
   * location, which does not move. Doctor's merge-survival check reddens when a
   * merge drops it — unlike the plugin options above, this one is guarded.
   */
  projectRoot?: string;
}

/** A package restriction derived from layers' `owns`, merged by signature. */
export interface PackageRule {
  package: string;
  imports?: string[];
  pattern?: boolean;
  exempt?: string[];
  /** Layers where this package is allowed. Every other layer is barred. */
  allowedIn: string[];
}

/** A global restriction derived from layers' `owns`. */
export interface GlobalRule {
  global: string;
  /** Layers where this global is allowed. Every other layer is barred. */
  allowedIn: string[];
}

/** A `no-restricted-imports` group pattern with a teaching message. */
export interface GroupPattern {
  group: string[];
  importNames?: string[];
  message: string;
}

/** A `no-restricted-imports` path entry with a teaching message. */
export interface PathPattern {
  name: string;
  importNames?: string[];
  message: string;
}
