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
   * The `eslint-plugin-import-lite` plugin. Carrier for `importBlock`
   * (`import-lite/first` + `import-lite/no-duplicates`) — nothing in ESLint core
   * or `@stylistic` merges duplicate imports, and both mistakes are ones an
   * agent editing incrementally makes routinely. Without this, the gate
   * emits nothing.
   *
   * `-lite` rather than `eslint-plugin-import` (peer range stops at ESLint 9
   * — field issue #37) or `eslint-plugin-import-x` (peers on
   * `@typescript-eslint/utils@^8.56` for its resolvers, which fails the
   * install of any repo pinned below it — field issue #41). import-lite is
   * the same rules without the resolvers: zero dependencies, `eslint` its
   * only peer.
   */
  imports?: ESLint.Plugin;
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
