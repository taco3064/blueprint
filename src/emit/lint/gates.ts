/**
 * The optional-gate catalog: `blueprint.rules` ids a machine can actually enforce,
 * what each emits, and whether a given stack can open it at all. Split from
 * `patterns.ts` — which builds the structural import-ban patterns, an unrelated
 * concern — once both were at this repo's own `maxLines` gate.
 */

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
  {
    id: 'unusedVars',
    emits: 'no-unused-vars',
    note: 'TWO keys on TypeScript — no-unused-vars: off plus @typescript-eslint/no-unused-vars — '
      + 'so check both when merging; argsIgnorePattern \'^_\' and nothing else (no '
      + 'varsIgnorePattern: renaming a dead binding to _x is not deleting it, '
      + 'and the dead-code principle asks for deletion)',
  },
  {
    id: 'explicitAny',
    emits: '@typescript-eslint/no-explicit-any',
    note: 'needs the injected TS plugin and emits NOTHING without it — '
      + '`any` is a TS-only construct, so unlike unusedVars there is no core rule to fall back to',
  },
  {
    id: 'codeStyle',
    emits: '@stylistic customize() + @stylistic/max-len + @stylistic/linebreak-style + curly '
      + '(core)',
    note: 'needs the injected @stylistic plugin AND its configs.customize() '
      + 'factory (throws on a stand-in, rather than governing nothing); ~68 rules, '
      + 'all but 5 auto-fixable, so `eslint --fix` clears most of a first run — '
      + 'land that pass as its own commit. Knobs: indent (2), quotes (single), semi (true), '
      + 'maxLen (90). max-len has NO fixer and does not exempt plain strings — '
      + 'a long line cannot escape the cap by containing one. linebreak-style is unix: '
      + 'a red here usually means git autocrlf / .gitattributes, NOT the file',
  },
  {
    id: 'statementsPerLine',
    emits: '@stylistic/max-statements-per-line',
    note: 'needs the injected @stylistic plugin, else emits nothing; hard-wired { max: '
      + '1 } because it defines what a line IS for the maxLines family — '
      + 'a line budget with no cap on line content is met by collapsing statements, '
      + 'not by splitting the file. codeStyle\'s bundle carries this rule too; '
      + 'this gate is written after it and wins, so setting it off really turns it off',
  },
  {
    id: 'statementPadding',
    emits: '@stylistic/padding-line-between-statements',
    note: 'needs the injected @stylistic plugin, else emits nothing; auto-fixable whitespace, '
      + 'and it cannot push a file over maxLines: that gate skips blank lines',
  },
  {
    id: 'importBlock',
    emits: 'import-x/first + import-x/no-duplicates',
    note: 'needs the injected eslint-plugin-import-x, else emits nothing; '
      + 'catches the two import mistakes an incrementally-editing agent makes — '
      + 'a second import of a module already imported, and an import appended below code. '
      + 'No formatter merges duplicate imports',
  },
  {
    id: 'fixtureImports',
    emits: 'no-restricted-imports',
    note: 'fixture globs folded into the structural import bans',
  },
  { id: 'deepWatch', emits: 'blueprint/no-deep-watch', note: 'Vue only — never emits on React' },
  { id: 'usePrefix', emits: 'blueprint/use-prefix', note: 'on its target layer (default hooks)' },
  {
    id: 'usePrefixReactivity',
    emits: 'blueprint/use-prefix-needs-reactivity',
    note: 'composing-only hooks are a known false positive',
  },
  { id: 'testFilename', emits: 'blueprint/test-filename-matches-source', note: 'test files only' },
  { id: 'typedefOnlyFile', emits: 'blueprint/no-typedef-only-file', note: '.js files only' },
  {
    id: 'cycles',
    emits: 'inspect (cycle finding)',
    runtime: 'inspect',
    note: 'no ESLint line — import/no-cycle re-checks the whole graph per file, '
      + 'measured 92s on 850 files',
  },
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

/** The three facts that decide whether a stack can open a gate at all. */
export interface GateStack {
  framework: string | undefined;
  hasTypescript: boolean;
  testFiles?: string | string[];
}

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
export function unavailableGate(id: string, stack: GateStack): string | null {
  const { framework, hasTypescript, testFiles } = stack;

  if (id === 'deepWatch' && framework === 'react') {
    return 'Vue only — never emits on React, whatever it declares';
  }

  if (id === 'explicitAny' && !hasTypescript) {
    return '`any` is a TypeScript construct — nothing to catch on a JS project, '
      + 'and no core rule to fall back to';
  }

  // `testFiles: []` is a real intent — tests inherit their layer's rules — and the
  // one this gate has no scope under, since `files: []` is refused by ESLint. Saying
  // so is the other half of dropping the entry (field run #150).
  if (id === 'testFilename' && Array.isArray(testFiles) && testFiles.length === 0) {
    return '`architecture.testFiles: []` exempts nothing, '
      + 'so there is no test file for this to name — declare test globs, or drop this gate';
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
  return unavailableGate(id, { framework, hasTypescript: true, testFiles });
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

  if (gate?.runtime) {
    return gate.runtime;
  }

  return LINT_GATED_RULE_IDS.includes(id) ? 'lint' : 'docs';
}
