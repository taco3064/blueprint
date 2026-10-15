import type { ArchitectureDef, RuleSetting } from '../config';
import { readSetting, resolveArchitecture } from '../config';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export interface ModuleEdgeView {
  from: string;
  to: string;
  references: number;
  evidence: { path: string; specifier: string }[];
  permission: 'direct' | 'transitive' | 'forbidden';
}

export interface ModuleDependencyRowView {
  name: string;
  root: string;
  declaredDirect: string[];
  reachable: string[];
  observedDirect: ModuleEdgeView[];
  matched: string[];
  missingDeclarations: string[];
  unusedDeclarations: string[];
  unverifiedDeclarations: string[];
  uncertainty: { cause: string; path: string; specifier?: string; detail?: string }[];
  reach: 'covered' | 'vacuous';
}

export interface ModuleDependenciesView {
  status: 'synchronized' | 'drift' | 'indeterminate' | 'runway';
  modules: ModuleDependencyRowView[];
}

const SCOPE = 'Scope: governed module source only; type-only references count. '
  + '`testFiles` matches are excluded (`[]` exempts nothing); `layerFilesIgnore` does not hide '
  + 'dependencies. Generated-looking source counts; existing build/cache exclusions remain. '
  + 'Outside-source consumers have no module identity. This is bounded static analysis, '
  + 'not the complete runtime graph.';

function list(values: string[]): string {
  return values.length ? values.join(', ') : 'none';
}

function evidence(edge: ModuleEdgeView): string {
  return edge.evidence.map((item) => `${item.path}: ${item.specifier}`).join('; ');
}

function uncertainty(row: ModuleDependencyRowView): string {
  return row.uncertainty.map((item) => `${item.path}: ${item.cause}`
    + (item.specifier === undefined ? '' : ` (${item.specifier})`)
    + (item.detail === undefined ? '' : ` — ${item.detail}`)).join('; ');
}

export function renderModuleDependencyMissing(
  row: ModuleDependencyRowView, edge: ModuleEdgeView,
): OperationalText {
  return operationalText(`Module ${row.name} directly references ${edge.to}, absent from dependsOn `
    + `(${edge.references} references; ${evidence(edge)}). `
    + (edge.permission === 'transitive'
      ? 'Transitive module permission allows this edge, but does not declare direct coupling. '
      : 'Module permission forbids this edge; the independent flow violation still applies. ')
    + 'Review the source and intended architecture with the owner; do not automatically add '
    + 'a dependency or create a declared cycle.');
}

export function renderModuleDependencyUnused(
  row: ModuleDependencyRowView, target: string,
): OperationalText {
  return operationalText(`Module ${row.name} declares direct dependency ${target}, but complete `
    + 'governed-source analysis found no direct reference. Exact synchronization compares '
    + 'direct edges, even when another path grants the same permission. Review the intended '
    + 'architecture with the owner before changing source or dependsOn.');
}

export function renderModuleDependencyUnverified(row: ModuleDependencyRowView): OperationalText {
  return operationalText(`Module ${row.name} cannot be verified exactly: ${uncertainty(row)}. `
    + `Unobserved declarations remain unverified, not unused: ${list(row.unverifiedDeclarations)}. `
    + 'Resolve the analysis limitations; proven drift remains independently actionable.');
}

function moduleRow(row: ModuleDependencyRowView): string[] {
  return [
    `  ${row.name} (${row.root}; ${row.reach})`,
    `    declared direct: ${list(row.declaredDirect)}`,
    `    transitive permission closure: ${list(row.reachable)}`,
    `    observed direct: ${list(row.observedDirect.map((edge) => edge.to))}`,
    ...row.observedDirect.map((edge) => `      ${edge.from} -> ${edge.to}: `
      + `${edge.references} references; permission ${edge.permission}; ${evidence(edge)}`),
    `    matched: ${list(row.matched)}`,
    `    missing declarations: ${list(row.missingDeclarations)}`,
    `    unused declarations: ${list(row.unusedDeclarations)}`,
    `    unverified declarations: ${list(row.unverifiedDeclarations)}`,
    `    uncertainty: ${row.uncertainty.length ? uncertainty(row) : 'none'}`,
  ];
}

export function renderModuleDependencies(
  facts: ModuleDependenciesView | null, targetModule?: string | null,
): OperationalText {
  if (facts === null) {
    return operationalText('');
  }

  const rows = targetModule
    ? facts.modules.filter((row) => row.name === targetModule)
    : facts.modules;

  return operationalText([
    `Module dependencies — repository status: ${facts.status}`,
    ...(targetModule ? [`  Target module: ${targetModule}; status above remains repository-wide.`] : []),
    ...rows.flatMap(moduleRow),
    `  ${SCOPE}`,
    '  Observed edges never grant permission. Baseline suppression is a ratchet over known debt, '
    + 'not proof of exact equality; it never changes this report.',
  ]);
}

export function renderModuleDependencyOutput(
  output: string, facts: ModuleDependenciesView | null, targetModule?: string | null,
): OperationalText {
  return operationalText(facts === null
    ? output
    : `${renderModuleDependencies(facts, targetModule)}\n\n${output}`);
}

export function renderModuleDependencyGuidance(
  architecture: ArchitectureDef, heading: '##' | '###',
): string {
  if (resolveArchitecture(architecture).topology !== 'module-first') {
    return '';
  }

  return [
    `${heading} Direct module synchronization`,
    '',
    '`dependsOn` declares direct dependencies and seeds transitive module permission. '
    + '`blueprint deps` and `blueprint inspect` separately report direct source-observed coupling. '
    + 'A transitively permitted reference can still lack a direct declaration; observed edges '
    + 'never grant permission. Exact synchronization compares declared and observed direct '
    + 'edges without transitive reduction.',
    '',
    SCOPE,
    '',
    'Static imports, exports/re-exports, proven require() and proven dynamic imports count. '
    + 'Runtime-dependent imports, parse failures and unresolved project references make the '
    + 'importer incomplete: unobserved declarations are unverified, not unused. Known drift '
    + 'remains drift even with uncertainty. Vacuous modules and an empty module runway are '
    + 'not evidence of populated coverage. Outside-scope completeness is independent.',
    '',
    'Review the live report, resolve missing/unused declarations and uncertainty, then opt into '
    + '`rules.moduleDependencySync` at the desired tier. This is an Inspect runtime gate, '
    + 'not ESLint; Doctor does not prove that CI runs Inspect. Resolve or explicitly baseline '
    + 'findings. `inspect --baseline` ratchets known debt and does not prove exact equality. '
    + 'Never automatically add, remove, sort or transitive-reduce `dependsOn`; the owner decides '
    + 'whether source or architecture should change. Equality does not prove domain ownership.',
  ].join('\n');
}

export function renderCompactModuleSync(
  topology: string, gates: { id: string; setting: RuleSetting }[],
): string[] {
  return topology === 'module-first' && gates.some((gate) =>
    gate.id === 'moduleDependencySync' && readSetting(gate.setting).tier === 'error')
    ? ['- Direct module synchronization is an Inspect gate: run `blueprint inspect`; resolve '
      + 'or explicitly baseline findings. A baseline is a debt ratchet, not exact equality. '
      + 'Never automatically edit `dependsOn`.']
    : [];
}

export function renderModuleDependencyDerivation(): OperationalText {
  return operationalText('Declared direct dependsOn edges seed transitive permission; observed '
    + 'direct references are compared only with direct declarations. ' + SCOPE
    + ' Runtime-dependent imports, parse failures and unresolved project references cause '
    + 'importer-scoped uncertainty; unobserved declarations remain unverified, not unused.');
}
