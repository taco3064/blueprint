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

/**
 * The stack fact no Blueprint carries, handed to a pure emitter by whoever detected it.
 *
 * An author's declaration is not a dependency list, so `hasTypescript` reaches the
 * document emitters the way `EmitLintOptions` already hands `emitLint` its plugins —
 * through the options argument, never through `Blueprint`. It decides one gate:
 * `explicitAny` has no carrier and no core rule to fall back to on a JS project, so a
 * document naming it hard promises what nothing keeps.
 *
 * Omitted it reads `true`, which keeps that gate out of the verdict entirely — the
 * assumption an emitter told nothing has to make, since guessing `false` would strip a
 * gate a TypeScript project genuinely holds.
 */
export interface StackFacts {
  hasTypescript?: boolean;
}

export interface EmitFacts extends StackFacts {
  framework?: string;
  testFiles?: string | string[];
}

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
}

export interface PackageRule {
  package: string;
  imports?: string[];
  pattern?: boolean;
  exempt?: string[];

  allowedIn: string[];
}

export interface GlobalRule {
  global: string;

  allowedIn: string[];
}

export interface GroupPattern {
  group: string[];
  importNames?: string[];
  message: string;
}

export interface PathPattern {
  name: string;
  importNames?: string[];
  message: string;
}
