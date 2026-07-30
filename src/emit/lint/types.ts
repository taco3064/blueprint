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
   * emits nothing. The `-x` fork rather than `eslint-plugin-import`: the
   * latter's peer range stops at ESLint 9, so asking an ESLint 10 project to
   * install it fails the whole install (field issue #37).
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
