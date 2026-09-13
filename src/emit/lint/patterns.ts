import { resolveLayerFilePatterns, resolveTestFiles as resolveTestFilePolicy } from '../../config';
import type { Framework, LayerDef, OwnedPackage } from '../../config';
import {
  renderEmptyTestFilesOperational,
  renderLintGateNote,
  renderOutOfScanReachClause,
  renderOwnersCallClause,
  renderRestrictedPackage,
  renderTypeScriptOnlyUnavailable,
  renderUnreachedTestFilesOperational,
  renderVueOnlyUnavailable,
} from '../../operational-contract';
import type {
  EmitFacts,
  GlobalRule,
  GroupPattern,
  PackageRule,
  PathPattern,
} from './types';

export const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,jsx,ts,tsx,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

export function resolveTestFiles(testFiles: string | string[] | undefined): string[] {
  return resolveTestFilePolicy(testFiles).architectureExemptions;
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
    note: renderLintGateNote('unusedVars'),
  },
  {
    id: 'explicitAny',
    emits: '@typescript-eslint/no-explicit-any',
    note: renderLintGateNote('explicitAny'),
  },
  {
    id: 'codeStyle',
    emits: '@stylistic customize() + @stylistic/max-len + @stylistic/linebreak-style + curly '
      + '(core)',
    note: renderLintGateNote('codeStyle'),
  },
  {
    id: 'statementsPerLine',
    emits: '@stylistic/max-statements-per-line',
    note: renderLintGateNote('statementsPerLine'),
  },
  {
    id: 'statementPadding',
    emits: '@stylistic/padding-line-between-statements',
    note: renderLintGateNote('statementPadding'),
  },
  {
    id: 'importBlock',
    emits: 'import-x/first + import-x/no-duplicates',
    note: renderLintGateNote('importBlock'),
  },
  {
    id: 'fixtureImports',
    emits: 'no-restricted-imports',
    note: renderLintGateNote('fixtureImports'),
  },
  {
    id: 'deepWatch',
    emits: 'blueprint/no-deep-watch',
    note: renderLintGateNote('deepWatch'),
  },
  { id: 'usePrefix', emits: 'blueprint/use-prefix', note: renderLintGateNote('usePrefix') },
  {
    id: 'usePrefixReactivity',
    emits: 'blueprint/use-prefix-needs-reactivity',
    note: renderLintGateNote('usePrefixReactivity'),
  },
  {
    id: 'testFilename',
    emits: 'blueprint/test-filename-matches-source',
    note: renderLintGateNote('testFilename'),
  },
  {
    id: 'typedefOnlyFile',
    emits: 'blueprint/no-typedef-only-file',
    note: renderLintGateNote('typedefOnlyFile'),
  },
  {
    id: 'cycles',
    emits: 'inspect (cycle finding)',
    runtime: 'inspect',
    note: renderLintGateNote('cycles'),
  },
];

export const DOC_ONLY_RULES: Omit<GateSpec, 'emits'>[] = [
  { id: 'deadCode', note: renderLintGateNote('deadCode') },
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

  return renderUnreachedTestFilesOperational('en', {
    deadGlobs: dead.map((entry) => entry.glob),
    allGlobsDead: dead.length === measured.length,
    outsideScan: dead
      .filter((entry) => entry.unreached && !readDifferently(entry))
      .map((entry) => ({ glob: entry.glob, reason: entry.unreached as string })),
    undecidedGlobs: dead
      .filter((entry) => !entry.unreached && !readDifferently(entry))
      .map((entry) => entry.glob),
    divergentGlobs: dead.filter(readDifferently).map((entry) => entry.glob),
  });
}

export function emptyTestGlobs(testFiles: string | string[] | undefined): string | null {
  const policy = resolveTestFilePolicy(testFiles);

  if (policy.testRuleFiles.length === 0) {
    return renderEmptyTestFilesOperational('en');
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
  return renderOutOfScanReachClause(entries, consequence);
}

export function ownersCallClause(
  entries: GlobReach[],
  wording: { opening: string; noun: 'exemption' | 'exclusion' },
): string {
  return renderOwnersCallClause(entries, wording);
}

export function unavailableGate(id: string, stack: GateStack): string | null {
  const { framework, hasTypescript, testFiles } = stack;

  if (id === 'deepWatch' && framework === 'react') {
    return renderVueOnlyUnavailable();
  }

  if (id === 'explicitAny' && !hasTypescript) {
    return renderTypeScriptOnlyUnavailable();
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
  return {
    paths: disabled
      .filter((rule) => !rule.pattern)
      .map((rule) => ({
        name: rule.package,
        importNames: rule.imports,
        message: renderRestrictedPackage(rule),
      })),
    patterns: disabled
      .filter((rule) => rule.pattern)
      .map((rule) => ({
        group: [rule.package],
        importNames: rule.imports,
        message: renderRestrictedPackage(rule),
      })),
  };
}

export function selfOnlyReexportSelector(alias: string, target?: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\u002F');
  const specifier = target === undefined ? alias : `${alias}/${target}`;
  const attr = `[source.value=/^${esc(specifier)}(?:\\u002F|$)/]`;

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}

export { buildStructuralPatterns, normalizeGroupPatterns } from './structural';
