import type { Framework, LayerDef, OwnedPackage } from '../../config';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/g;

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

/** The default `{layer}` glob for a framework under a given source root. */
function defaultGlob(framework: Framework, sourceRoot: string): string {
  const prefix = sourceRoot === '.' ? '' : `${sourceRoot}/`;

  return `${prefix}{layer}/**/*.{${FRAMEWORK_EXTS[framework]}}`;
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
  if (value === undefined) {
    return [];
  }

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

/**
 * One declared `architecture.testFiles` glob and how many scanned files it matches.
 *
 * Per entry, never one total for the net: a net of several globs reaches files as a
 * whole while one of its entries reaches none, and a total cannot name which. The
 * entry is the thing an adopter can fix, so the entry is what gets measured.
 */
export interface TestGlobReach extends GlobReach {
  matched: number;
}

/** The facts that decide whether a gate can be opened here at all. */
export interface GateStack {
  framework: string | undefined;
  hasTypescript: boolean;
  testFiles?: string | string[];
}

/**
 * The declared test globs that match no file here, as one sentence — null when every
 * declared entry reaches something, and null for a caller that measured nothing.
 *
 * Measured against the tree, never read off the glob's spelling: a `{` with no `}`
 * and a `{` whose `}` closes a later group both compile to a net that matches
 * nothing, and neither looks wrong.
 *
 * Three states a dead entry can be in, and the reader hands back only the two it
 * cannot tell apart. A mistyped glob and a test convention whose files have not landed
 * produce the same measurement, and nothing in the tree separates them — the built-in
 * `*.test.* / *.spec.*` pair least of all, since a repo that declares this field is
 * usually a repo those two do not fit. So that half says what is true either way, names
 * both resolutions and ends in the owner's call, which is what `missing-layer` and
 * `owns-not-installed` already do with this shape of question. The third is not like
 * them: an entry the scan could never have reached is neither a typo nor runway, and
 * handing it back asserts that one of two things is true while a third is. That one
 * `outsideScanReach` settles, and `outOfScanReachClause` states.
 *
 * Its own function because three printers need this sentence — `inspect`'s coverage
 * report, the `rules` catalog and `deps`: the run that reports findings against test
 * files is where the cause has to be legible, and a second phrasing in any of them
 * would be two positions on one question.
 */
export function unreachedTestGlobs(reach: TestGlobReach[] | undefined): string | null {
  const measured = reach ?? [];
  const dead = measured.filter((entry) => entry.matched === 0);

  if (!dead.length) {
    return null;
  }

  // The `ignores` role, and what the shared clause below leaves to its caller. Every
  // `ignores` `emit/lint` writes these globs into carries a `files` beside it, where
  // `layerFilesIgnore` is emitted as an entry of its own with none — so the two fields'
  // costs are not the same one.
  const scopedThere = 'what `emit/lint` emits for it is scoped rather than repo-wide — '
    + 'every `ignores` it writes these globs into sits beside a `files`, so it subtracts '
    + 'only from the set that `files` names';

  // The `files` role — the same globs are the `testFilename` entry's own scope, so the
  // gate stays armed over whatever they match while this sentence says nothing here is
  // exempt. Unconditional, unlike the clause above: the entry is emitted whatever class
  // the dead entries fall in, and a gate reported open beside a note accounting only for
  // the exemption is two truths with no bridge. The sibling note carries its own.
  const armedThere = '. That is this scan\'s reach, not a verdict on the entry — '
    + '`emit/lint` writes these globs into the `testFilename` entry\'s own `files` too, '
    + 'so where that gate is on it is emitted all the same and governs whatever they '
    + 'do match';

  // What the dead entries cost this run's own analysis. A claim about the WHOLE net, so
  // unlike the clause it follows it cannot be qualified to the dead part and left there:
  // `TestGlobReach` is per entry because a net reaches files while one of its entries
  // reaches none, and in that shape the drop is real and the rest of the net made it.
  // Named no further than "the rest" — the entries this sentence puts an address on are
  // the ones an adopter can fix, and the working one is not among them.
  const droppedHere = dead.length === measured.length
    ? 'no scanned file is dropped from the analysis'
    : 'the scanned files dropped from the analysis are the ones the rest of the net matched';

  return '`architecture.testFiles` — no file here matches '
    + `${dead.map((entry) => `\`${entry.glob}\``).join(', ')}, so nothing this run read `
    + `is exempt through that part of the net: ${droppedHere}`
    + armedThere
    + outOfScanReachClause(dead, scopedThere)
    + ownersCallClause(dead, {
      opening: 'A mistyped glob and a test convention',
      noun: 'exemption',
    })
    + divergentReadingClause(dead);
}

/**
 * Why a net declared EMPTY exempts nothing, as one sentence — null for every other shape
 * of the field, an absent one included.
 *
 * `unreachedTestGlobs`' counterpart on the one input it cannot speak for. That sentence
 * names the declared entries reaching no file, and `[]` declares none — so on the config
 * whose gate `unavailableGate` drops out of the count for exactly this reason, it answers
 * null. The verdict set and the sentence set are different sets, and every surface that
 * reports the drop reads one or the other: both have to exist, or `[]` falls between them.
 *
 * The gate's own arm, exported, rather than a second sentence for the surfaces with no
 * gate row to put it on — two phrasings of one fact is the contradiction an adopter meets
 * before we do, and what an empty net needs doing about it does not change with the
 * surface that asks.
 */
export function emptyTestGlobs(testFiles: string | string[] | undefined): string | null {
  if (Array.isArray(testFiles) && testFiles.length === 0) {
    return '`architecture.testFiles: []` exempts nothing, '
      + 'so there is no test file for this to name — declare test globs, or drop this gate';
  }

  return null;
}

/**
 * One declared glob and what the scan's own reach settles about it. `unreached` carries
 * the reason it could never have matched here, and is absent when the glob text does not
 * settle it.
 *
 * A field of the measurement rather than something this module computes: the facts are
 * `scan`'s — the root, the skipped directories, the extension set — and `emit/lint` sits
 * BELOW `inspect` in the layer order, so it cannot reach `outsideScanReach` and must not
 * grow a second copy of the answer. The inspect-side reader fills it in.
 */
export interface GlobReach {
  glob: string;
  unreached?: string | null;
}

/**
 * Whether this scan and the config it is emitted into read the same entry off this
 * string — today, exactly a leading `!`. `globToRegExp` has no `!` branch, so this side
 * reads it as an ordinary path character; ESLint reads a leading `!` in a config glob as
 * a negation. One string, two entries.
 *
 * Not a position on what `!` means, and not validation of the glob — nothing here
 * changes what any glob matches. It is the one input the clauses below are not entitled
 * to speak for, because neither can know it is describing the entry the adopter's linter
 * will apply. Stage 9's own rule, turned on an input stage 9 gets wrong: state what the
 * tool can determine, decline what it cannot.
 */
function readDifferently(entry: GlobReach): boolean {
  return entry.glob.startsWith('!');
}

/**
 * What the scan's own reach settles about a set of dead declared globs — ONE text for
 * both `architecture.testFiles` and `architecture.layerFilesIgnore`, and empty when the
 * set holds no such entry.
 *
 * Here rather than beside either caller because it is the answer to one question — is
 * this entry reachable here at all? — and this leaf is the lowest module both readers
 * can import. `doctor` reaching down for it is the direction the layers allow; the
 * reverse is not, which is exactly why the alternative was two phrasings. The sibling
 * sentence three functions up already names that as the thing not to do.
 *
 * It states the reach and takes the cost as an argument. What being unreachable COSTS
 * differs per field, and so does what the emitted config still does with the entry:
 * `layerFilesIgnore` is copied into an `ignores` carrying no `files`, which is a
 * repo-wide ignore and still applies wherever it matches, while every `ignores` the
 * test globs ride sits beside a `files` and subtracts only from that entry's own set.
 * So the consequence is the caller's to supply, which is the split those two already had.
 */
export function outOfScanReachClause(entries: GlobReach[], consequence: string): string {
  const named = entries
    .filter((entry) => entry.unreached && !readDifferently(entry))
    .map((entry) => `\`${entry.glob}\` — ${entry.unreached}`);

  if (!named.length) {
    return '';
  }

  return `. Measured: ${named.join('; ')}. `
    + 'This scan reads the source root and nothing above it, never descends into the '
    + 'directories a build writes, and reads only source extensions, so an entry outside '
    + `all three could not have matched here however the tree grew: ${consequence}`;
}

export function ownersCallClause(
  entries: GlobReach[],
  wording: { opening: string; noun: 'exemption' | 'exclusion' },
): string {
  const left = entries.filter((entry) => !entry.unreached && !readDifferently(entry));

  if (!left.length) {
    return '';
  }

  // Named only once the dead entries have been split across clauses: with one clause the
  // opening already lists every one of them, and a second listing is the same set twice.
  const split = left.length !== entries.length;
  const names = left.map((entry) => `\`${entry.glob}\``).join(', ');

  return `. ${wording.opening} whose files have not landed look identical from here`
    + (split ? `, which leaves ${names} undecided` : '')
    + ` — fix the glob, or leave it and the ${wording.noun} arms itself when a file `
    + 'matches; which one applies is the owner\'s call';
}

/**
 * The entries neither other clause may speak for, and why — one text for both fields,
 * beside the two it withholds.
 *
 * Says what is missing as well as why: an adopter who gets no verdict on one entry and a
 * verdict on the next needs the gap named, or the silence reads as the entry being fine.
 * The list sits last so no pronoun has to agree with its length.
 */
export function divergentReadingClause(entries: GlobReach[]): string {
  const named = entries.filter(readDifferently).map((entry) => `\`${entry.glob}\``);

  if (!named.length) {
    return '';
  }

  return '. An entry beginning `!` is not read the same way on both sides — an ordinary '
    + 'path character to this scan, a negation to ESLint in a config glob — so blueprint '
    + 'cannot say what it holds out, and neither classifies it nor hands it back: '
    + named.join(', ');
}

/**
 * Why a gate is unavailable here, or null when it can be opened — mirroring what
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
  //
  // The ONLY test-glob arm, and it mirrors ONE of `testFilenameEntry`'s two conditions.
  // That guard is `!testFilename || !testGlobs.length`; the second disjunct is
  // `architecture.testFiles`, which is what this function is given. The first is the
  // tier, which `declared` and `active` already carry on the row: measured, an undeclared
  // `testFilename` over a dead net reads `· not declared` and `0/16` — no entry emitted,
  // and the gate still in the denominator, because a gate nobody asked for is not a gate
  // that is unavailable here.
  //
  // So every other net — dead, negated, pointing outside the scan — is emitted with the
  // rule beside its `files` and fires wherever ESLint's own reading of it lands. What a
  // dead entry costs is the exemption, not the gate, and the callers that print
  // `unreachedTestGlobs` say so on a line of their own.
  if (id === 'testFilename') {
    return emptyTestGlobs(testFiles);
  }

  return null;
}

/**
 * The same question asked with only a blueprint to answer it — what the two pure
 * emitters have. `hasTypescript` is a fact about the dependency list, so they cannot
 * decide `explicitAny` and must not claim to: `true` here means "assume the stack can
 * carry it", which keeps that gate out of this verdict entirely. Framework and
 * `testFiles` are IN the blueprint, so the other two arms answer honestly — and nothing
 * a scan measures reaches this verdict at all, so what these two emit does not move when
 * a runtime walks the tree.
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

/**
 * Resolve a layer's lint file globs. An explicit `layerFiles` wins as-is;
 * otherwise the default is derived from `framework` and `sourceRoot`.
 */
export function resolveLayerFiles(
  layer: string,
  framework: Framework,
  scope: { layerFiles?: string | string[]; sourceRoot?: string } = {},
): string[] {
  const { layerFiles, sourceRoot = 'src' } = scope;

  const globs
    = layerFiles === undefined ? [defaultGlob(framework, sourceRoot)] : toArray(layerFiles);

  return globs.map((glob) => glob.replace(LAYER_PLACEHOLDER, layer));
}

/** Group layers' package `owns` by signature; merge which layers allow each. */
export function derivePackageRules(layers: LayerDef[]): PackageRule[] {
  const byKey = new Map<string, PackageRule>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      if (typeof primitive !== 'string' && 'global' in primitive) {
        continue;
      }

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

/** Group layers' global `owns` by name; merge which layers allow each. */
export function deriveGlobalRules(layers: LayerDef[]): GlobalRule[] {
  const byName = new Map<string, GlobalRule>();

  for (const layer of layers) {
    if (!layer.owns) {
      continue;
    }

    for (const primitive of layer.owns) {
      if (typeof primitive === 'string' || !('global' in primitive)) {
        continue;
      }

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
        '\n🚫 Production code must not import fixtures — missing data renders empty or error, '
        + 'never fake.',
    });
  }

  // Entry-only: no reaching inside a folder-layout module via the alias.
  // `alias/layer/module` (entry) is allowed; a gitignore `/**` matches only
  // *descendants*, so `alias/L/*/**` bans reaching into a module, not the entry.
  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => aliases.map((a) => `${a}/${target}/*/**`)),
      message:
        '\n🚫 Import a module through its entry, not its internals (e.g. "~app/hooks/useX", '
        + 'not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
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
