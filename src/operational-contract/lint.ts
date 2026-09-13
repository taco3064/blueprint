export type LintGateNoteId
  = | 'codeStyle'
    | 'complexity'
    | 'cycles'
    | 'deadCode'
    | 'deepWatch'
    | 'explicitAny'
    | 'fixtureImports'
    | 'importBlock'
    | 'maxLines'
    | 'maxLinesPerFunction'
    | 'maxParams'
    | 'maxStatements'
    | 'statementPadding'
    | 'statementsPerLine'
    | 'testFilename'
    | 'typedefOnlyFile'
    | 'unusedVars'
    | 'usePrefix'
    | 'usePrefixReactivity';

const GATE_NOTES: Record<LintGateNoteId, string> = {
  maxLines: '',
  maxLinesPerFunction: '',
  maxParams: '',
  maxStatements: '',
  complexity: '',
  unusedVars: 'TWO keys on TypeScript — no-unused-vars: off plus '
    + '@typescript-eslint/no-unused-vars — so check both when merging; '
    + 'argsIgnorePattern \'^_\' and nothing else (no varsIgnorePattern: renaming a dead binding '
    + 'to _x is not deleting it, and the dead-code principle asks for deletion)',
  explicitAny: 'needs the injected TS plugin and emits NOTHING without it — '
    + '`any` is a TS-only construct, so unlike unusedVars there is no core rule to fall back to',
  codeStyle: 'needs the injected @stylistic plugin AND its configs.customize() '
    + 'factory (throws on a stand-in, rather than governing nothing); ~68 rules, '
    + 'all but 5 auto-fixable, so `eslint --fix` clears most of a first run — '
    + 'land that pass as its own commit. Knobs: indent (2), quotes (single), semi (true), '
    + 'maxLen (90). max-len has NO fixer and does not exempt plain strings — '
    + 'a long line cannot escape the cap by containing one. linebreak-style is unix: '
    + 'a red here usually means git autocrlf / .gitattributes, NOT the file',
  statementsPerLine: 'needs the injected @stylistic plugin, else emits nothing; hard-wired '
    + '{ max: 1 } because it defines what a line IS for the maxLines family — '
    + 'a line budget with no cap on line content is met by collapsing statements, '
    + 'not by splitting the file. codeStyle\'s bundle carries this rule too; '
    + 'this gate is written after it and wins, so setting it off really turns it off',
  statementPadding: 'needs the injected @stylistic plugin, else emits nothing; '
    + 'auto-fixable whitespace, and it cannot push a file over maxLines: that gate skips '
    + 'blank lines',
  importBlock: 'needs the injected eslint-plugin-import-x, else emits nothing; '
    + 'catches the two import mistakes an incrementally-editing agent makes — '
    + 'a second import of a module already imported, and an import appended below code. '
    + 'No formatter merges duplicate imports',
  fixtureImports: 'fixture globs folded into the structural import bans',
  deepWatch: 'Vue only — never emits on React',
  usePrefix: 'on its target layer (default hooks)',
  usePrefixReactivity: 'composing-only hooks are a known false positive',
  testFilename: 'test files only',
  typedefOnlyFile: '.js files only',
  cycles: 'on-demand/CI diagnosis only — a baseline grandfathers recorded findings; '
    + 'no ESLint line by default. Opt into import-x/no-cycle for continuous '
    + 'prevention, at the cost of re-checking the graph per file '
    + '(measured 92s on 850 files)',
  deadCode: 'knip\'s job — import/no-unused-modules cannot run under flat config',
};

export function renderLintGateNote(id: LintGateNoteId): string {
  return GATE_NOTES[id];
}

export interface GlobReachFact {
  glob: string;
  unreached?: string | null;
}

function readDifferently(entry: GlobReachFact): boolean {
  return entry.glob.startsWith('!');
}

export function renderOutOfScanReachClause(
  entries: GlobReachFact[],
  consequence: string,
): string {
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

export function renderOwnersCallClause(
  entries: GlobReachFact[],
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

export function renderDivergentReadingClause(entries: GlobReachFact[]): string {
  const named = entries.filter(readDifferently).map((entry) => `\`${entry.glob}\``);

  if (!named.length) {
    return '';
  }

  return '. An entry beginning `!` is not read the same way on both sides — an ordinary '
    + 'path character to this scan, a negation to ESLint in a config glob — so blueprint '
    + 'cannot say what it holds out, and neither classifies it nor hands it back: '
    + named.join(', ');
}

export function renderVueOnlyUnavailable(): string {
  return 'Vue only — never emits on React, whatever it declares';
}

export function renderTypeScriptOnlyUnavailable(): string {
  return '`any` is a TypeScript construct — nothing to catch on a JS project, '
    + 'and no core rule to fall back to';
}

export function renderRestrictedPackage(pkg: { package: string; imports?: string[] }): string {
  return pkg.imports?.length
    ? `\n🚫 Do not import ${pkg.imports.join(', ')} from "${pkg.package}" in this layer.`
    : `\n🚫 Do not import "${pkg.package}" in this layer.`;
}

export function renderRedundantRelativeSegments(): string {
  return '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.';
}

export function renderSameLayerImport(specifier: string, unitLayout: 'file' | 'folder'): string {
  const head = `\n🚫 Same-layer imports must be relative. "${specifier}" and everything under it `
    + `is banned. Replace "${specifier}/X" with `;

  return unitLayout === 'file'
    ? `${head}"./X".`
    : `${head}"../X" — its entry only; what is behind the entry stays private.`;
}

export function renderLayerFlowViolation(): string {
  return '\n🚫 This import violates the dependency flow. Only import from allowed lower layers.';
}

export function renderModuleFlowViolation(): string {
  return '\n🚫 This import violates the module dependency graph. '
    + 'Declare a direct dependency only when the architecture genuinely requires it.';
}

export function renderFixtureImport(): string {
  return '\n🚫 Production code must not import fixtures — missing data renders empty or error, '
    + 'never fake.';
}

export function renderEntryOnly(example: boolean): string {
  return example
    ? '\n🚫 Import a unit through its entry, not its internals '
    + '(e.g. "~app/hooks/useX", not "~app/hooks/useX/impl").'
    : '\n🚫 Import a unit through its entry, not its internals.';
}

export function renderModuleContainerImport(): string {
  return '\n🚫 A layer cannot import a module-root container. '
    + 'Import an allowed inner layer instead.';
}

export function renderRestrictedGlobal(global: string): string {
  return `\n🚫 Use of "${global}" is restricted to its owning layer.`;
}

export function renderSelfOnlyReexport(target: string): string {
  return `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`;
}

export function renderCodeStylePluginError(): string {
  return 'blueprint: rules.codeStyle needs @stylistic/eslint-plugin\'s configs.customize() '
    + 'factory, and the plugin passed as emitLint\'s `stylistic` option does not expose '
    + 'it. Pass the real plugin (import stylistic from \'@stylistic/eslint-plugin\'), or '
    + 'set rules.codeStyle to \'off\'.';
}
