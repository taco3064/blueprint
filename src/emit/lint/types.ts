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
   * type parameters.
   */
  typescript?: ESLint.Plugin;
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
