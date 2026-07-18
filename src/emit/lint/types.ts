/** One entry of an ESLint flat config — a drop-in for `eslint.config.js`. */
export interface LintConfigEntry {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
}

/** The ESLint flat config emitted from a Blueprint's architecture. */
export type LintConfig = LintConfigEntry[];

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
