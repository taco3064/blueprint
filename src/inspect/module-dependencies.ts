import type { ResolvedSourcePosition } from '../config';
import type { ArchitectureFacts } from './facts';
import type {
  ModuleDependencies, ModuleDependencyRow, ModuleDependencyUncertainty,
} from './module-dependencies-types';
import { compareText } from './order';
import type { ScannedFile } from './types';

export type {
  ModuleDependencies, ModuleDependencyRow, ModuleDependencyUncertainty, ObservedModuleEdge,
} from './module-dependencies-types';

type Input = Pick<ArchitectureFacts, 'resolved' | 'governedFiles' | 'projectReferences'>;

export function reconcileModuleDependencies(facts: Input): ModuleDependencies | null {
  const { resolved, governedFiles } = facts;

  if (resolved.topology === 'layer-first') {
    return null;
  }

  const modules = resolved.modules.map((module): ModuleDependencyRow => ({
    name: module.name,
    root: module.root,
    declaredDirect: [...module.dependsOn],
    reachable: [...module.reachable],
    observedDirect: [],
    // Stryker disable next-line ArrayDeclaration: reconcileRow overwrites this before any read.
    matched: [],
    // Stryker disable next-line ArrayDeclaration: reconcileRow overwrites this before any read.
    missingDeclarations: [],
    unusedDeclarations: [],
    unverifiedDeclarations: [],
    uncertainty: [],
    reach: 'vacuous',
  }));

  for (const file of governedFiles) {
    const name = moduleName(resolved.classify(file.segments));
    const row = modules.find((candidate) => candidate.name === name);

    if (row) {
      observeFile(file, row, facts);
    }
  }

  for (const row of modules) {
    reconcileRow(row);
  }

  return { status: status(modules), modules };
}

function status(modules: ModuleDependencyRow[]): ModuleDependencies['status'] {
  if (modules.length === 0) {
    return 'runway';
  }

  if (modules.some((row) => row.missingDeclarations.length || row.unusedDeclarations.length)) {
    return 'drift';
  }

  return modules.some((row) => row.uncertainty.length) ? 'indeterminate' : 'synchronized';
}

function moduleName(position: ResolvedSourcePosition | null): string | undefined {
  // Stryker disable next-line OptionalChaining: module-first positions always carry a module.
  return position && 'module' in position ? position.module?.name : undefined;
}

function observeFile(file: ScannedFile, row: ModuleDependencyRow, facts: Input): void {
  row.reach = 'covered';

  if (file.importAnalysis?.parseError !== undefined) {
    row.uncertainty.push({
      cause: 'parse-failure', path: file.path, detail: file.importAnalysis.parseError,
    });
  }

  if ((file.importAnalysis?.unknownDynamicImports ?? 0) > 0) {
    row.uncertainty.push({ cause: 'runtime-dependent-import', path: file.path });
  }

  for (const { specifier } of file.imports) {
    observeReference({ file, specifier }, row, facts);
  }
}

function observeReference(
  reference: { file: ScannedFile; specifier: string }, row: ModuleDependencyRow, facts: Input,
): void {
  const { file, specifier } = reference;
  // Stryker disable next-line OptionalChaining: the collector maps every governed file.
  const project = facts.projectReferences.get(file)?.get(specifier);
  const target = facts.resolved.resolveImport(file.segments, specifier).target;
  const to = moduleName(target);

  if (project && !project.exists) {
    row.uncertainty.push({ cause: 'unresolved-project-reference', path: file.path, specifier });
  } else if (to && to !== row.name) {
    observeEdge(row, to, { path: file.path, specifier });
  } else if (project && !target && insideSource(project.path, facts.resolved.sourceRoot)) {
    row.uncertainty.push({ cause: 'unresolved-project-reference', path: file.path, specifier });
  }
}

function insideSource(path: string, sourceRoot: string): boolean {
  return sourceRoot === '.'
    ? (
  // Stryker disable next-line MethodExpression: existing normalized targets cannot start/end ../.
        !path.startsWith('../')
      )
    : path.startsWith(`${sourceRoot}/`);
}

function observeEdge(
  row: ModuleDependencyRow, to: string, evidence: { path: string; specifier: string },
): void {
  const { path, specifier } = evidence;
  let edge = row.observedDirect.find((candidate) => candidate.to === to);

  if (!edge) {
    edge = {
      from: row.name, to, references: 0, evidence: [],
      permission: row.declaredDirect.includes(to)
        ? 'direct'
        : row.reachable.includes(to) ? 'transitive' : 'forbidden',
    };

    row.observedDirect.push(edge);
  }

  edge.references += 1;

  if (!edge.evidence.some((item) => item.path === path && item.specifier === specifier)) {
    edge.evidence.push({ path, specifier });
  }
}

function reconcileRow(row: ModuleDependencyRow): void {
  row.observedDirect.sort((a, b) => compareText(a.to, b.to));

  for (const edge of row.observedDirect) {
    edge.evidence.sort((a, b) =>
      compareText(a.path, b.path) || compareText(a.specifier, b.specifier));
  }

  const observed = row.observedDirect.map((edge) => edge.to);

  row.matched = observed.filter((target) => row.declaredDirect.includes(target));
  row.missingDeclarations = observed.filter((target) => !row.declaredDirect.includes(target));
  const absent = row.declaredDirect.filter((target) => !observed.includes(target));

  row.uncertainty = uniqueUncertainty(row.uncertainty);

  if (row.uncertainty.length) {
    row.unverifiedDeclarations = absent;
  } else {
    row.unusedDeclarations = absent;
  }
}

function uniqueUncertainty(values: ModuleDependencyUncertainty[]): ModuleDependencyUncertainty[] {
  const key = (value: ModuleDependencyUncertainty): string => JSON.stringify([
    value.path, value.specifier ?? '', value.cause,
    // Stryker disable next-line LogicalOperator: each path/specifier/cause has only one detail.
    value.detail ?? '',
  ]);

  return [...new Map(values.map((value) => [key(value), value])).values()]
    .sort((a, b) => compareText(key(a), key(b)));
}
