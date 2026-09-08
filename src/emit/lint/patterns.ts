import { resolveLayerFilePatterns } from '../../config';
import type { Framework, LayerDef, OwnedPackage } from '../../config';
import type {
  EmitFacts,
  GlobalRule,
  GroupPattern,
  PackageRule,
  PathPattern,
} from './types';

export const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

const DEFAULT_TEST_FILES = [
  '**/*.test.{js,jsx,ts,tsx,vue}',
  '**/*.spec.{js,jsx,ts,tsx,vue}',
];

export function resolveTestFiles(testFiles: string | string[] | undefined): string[] {
  return testFiles === undefined ? DEFAULT_TEST_FILES : toArray(testFiles);
}

export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export const METRIC_GATES = [
  { id: 'maxLines', rule: 'max-lines', fallback: 400, wrap: true },
  { id: 'maxLinesPerFunction', rule: 'max-lines-per-function', fallback: 100, wrap: true },
  { id: 'maxParams', rule: 'max-params', fallback: 3, wrap: false },
  { id: 'maxStatements', rule: 'max-statements', fallback: 15, wrap: false },
  { id: 'complexity', rule: 'complexity', fallback: 12, wrap: false },
] as const;

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

export interface GateSpec {
  id: string;

  emits: string;
  note: string;

  fallback?: number;

  runtime?: 'inspect';
}

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
    note: 'on-demand/CI diagnosis only — a baseline grandfathers recorded findings; '
      + 'no ESLint line by default. Opt into import-x/no-cycle for continuous '
      + 'prevention, at the cost of re-checking the graph per file '
      + '(measured 92s on 850 files)',
  },
];

export const DOC_ONLY_RULES: Omit<GateSpec, 'emits'>[] = [
  { id: 'deadCode', note: 'knip\'s job — import/no-unused-modules cannot run under flat config' },
];

export const LINT_GATED_RULE_IDS = [
  ...METRIC_GATES.map((gate) => gate.id),
  ...PLUGIN_GATES.map((gate) => gate.id),
];

export interface TestGlobReach extends GlobReach {
  matched: number;
}

export interface GateStack {
  framework: string | undefined;
  hasTypescript: boolean;
  testFiles?: string | string[];
}

export function unreachedTestGlobs(reach: TestGlobReach[] | undefined): string | null {
  const measured = reach ?? [];
  const dead = measured.filter((entry) => entry.matched === 0);

  if (!dead.length) {
    return null;
  }

  const scopedThere = 'what `emit/lint` emits for it is scoped rather than repo-wide — '
    + 'every `ignores` it writes these globs into sits beside a `files`, so it subtracts '
    + 'only from the set that `files` names';

  const armedThere = '. That is this scan\'s reach, not a verdict on the entry — '
    + '`emit/lint` writes these globs into the `testFilename` entry\'s own `files` too, '
    + 'so where that gate is on it is emitted all the same and governs whatever they '
    + 'do match';

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

export function emptyTestGlobs(testFiles: string | string[] | undefined): string | null {
  if (Array.isArray(testFiles) && testFiles.length === 0) {
    return '`architecture.testFiles: []` exempts nothing, '
      + 'so there is no test file for this to name — declare test globs, or drop this gate';
  }

  return null;
}

export interface GlobReach {
  glob: string;
  unreached?: string | null;
}

function readDifferently(entry: GlobReach): boolean {
  return entry.glob.startsWith('!');
}

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

  const split = left.length !== entries.length;
  const names = left.map((entry) => `\`${entry.glob}\``).join(', ');

  return `. ${wording.opening} whose files have not landed look identical from here`
    + (split ? `, which leaves ${names} undecided` : '')
    + ` — fix the glob, or leave it and the ${wording.noun} arms itself when a file `
    + 'matches; which one applies is the owner\'s call';
}

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

export function unavailableGate(id: string, stack: GateStack): string | null {
  const { framework, hasTypescript, testFiles } = stack;

  if (id === 'deepWatch' && framework === 'react') {
    return 'Vue only — never emits on React, whatever it declares';
  }

  if (id === 'explicitAny' && !hasTypescript) {
    return '`any` is a TypeScript construct — nothing to catch on a JS project, '
      + 'and no core rule to fall back to';
  }

  if (id === 'testFilename') {
    return emptyTestGlobs(testFiles);
  }

  return null;
}

export function unavailableForEmit(id: string, facts: EmitFacts): string | null {
  return unavailableGate(id, {
    framework: facts.framework,
    hasTypescript: facts.hasTypescript ?? true,
    testFiles: facts.testFiles,
  });
}

export function enforcedBy(id: string): 'lint' | 'inspect' | 'docs' {
  const gate = PLUGIN_GATES.find((entry) => entry.id === id);

  if (gate?.runtime) {
    return gate.runtime;
  }

  return LINT_GATED_RULE_IDS.includes(id) ? 'lint' : 'docs';
}

export function resolveLayerFiles(
  layer: string,
  framework: Framework,
  scope: { layerFiles?: string | string[]; sourceRoot?: string } = {},
): string[] {
  return resolveLayerFilePatterns(layer, framework, scope);
}

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

export function selfOnlyReexportSelector(alias: string, target?: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\u002F');
  const specifier = target === undefined ? alias : `${alias}/${target}`;
  const attr = `[source.value=/^${esc(specifier)}(?:\\u002F|$)/]`;

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}

export { buildStructuralPatterns } from './structural';
