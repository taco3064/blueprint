import type {
  ResolvedArchitecture,
  ResolvedDependencyVerdict,
  ResolvedSourcePosition,
} from '../config';
import type { LayoutOf } from './resolve';
import type { Finding, ImportRef, ScannedFile } from './types';

export function aliasDependencyFindings(scope: {
  file: ScannedFile;
  ref: ImportRef;
  resolved: ResolvedArchitecture;
  importer: ResolvedSourcePosition;
  importerModule: string | null;
  importerLayer: string | null;
  targetPosition: ResolvedSourcePosition | null;
  target: string;
  targetModule: string | null;
  layerNames: string[];
  layoutOf: LayoutOf;
  selfOnly: string[];
  depth: number;
}): Finding[] {
  if (!isGovernedTarget(scope)) {
    return [];
  }

  const targetPosition = scope.targetPosition;
  const at = { path: scope.file.path, subject: scope.ref.specifier };
  const reference = scope.resolved.resolveImport(scope.file.segments, scope.ref.specifier);
  const verdict = reference.dependency;

  return [
    ...canonicalAliasFindings(scope, reference, at),
    ...deepImportFindings(scope, targetPosition, at),
    ...(verdict?.allowed === false ? [dependencyFinding(verdict, at)] : []),
    ...sameLayerAliasFindings(scope, at),
    ...allowedSelfOnlyFindings(scope, { targetPosition, verdict, at }),
  ];
}

function canonicalAliasFindings(
  scope: Parameters<typeof aliasDependencyFindings>[0],
  reference: ReturnType<ResolvedArchitecture['resolveImport']>,
  at: { path: string; subject: string },
): Finding[] {
  return scope.importer.kind !== 'source-root'
    && reference.kind === 'additional-alias'
    && reference.crossesBoundary
    && reference.canonicalSpecifier !== null
    ? [{
        severity: 'error',
        rule: 'canonical-alias',
        ...at,
        message: `"${at.subject}" crosses an architectural boundary through a secondary alias — `
          + `use the canonical source-root spelling "${reference.canonicalSpecifier}".`,
      }]
    : [];
}

function isGovernedTarget(
  scope: Parameters<typeof aliasDependencyFindings>[0],
): scope is Parameters<typeof aliasDependencyFindings>[0] & {
  targetPosition: ResolvedSourcePosition;
} {
  return scope.targetPosition !== null
    && (scope.layerNames.includes(scope.target)
      || scope.targetPosition.kind === 'module'
      || scope.targetPosition.kind === 'container');
}

function deepImportFindings(
  scope: Parameters<typeof aliasDependencyFindings>[0],
  targetPosition: ResolvedSourcePosition,
  at: { path: string; subject: string },
): Finding[] {
  const deepAt = scope.targetModule === null ? 3 : 4;

  return 'layer' in targetPosition
    && scope.layoutOf(scope.target) === 'folder'
    && scope.depth >= deepAt
    ? [{
        severity: 'error',
        rule: 'deep-import',
        ...at,
        message: `"${at.subject}" reaches inside a unit — import it through its entry.`,
      }]
    : [];
}

function sameLayerAliasFindings(
  scope: Parameters<typeof aliasDependencyFindings>[0],
  at: { path: string; subject: string },
): Finding[] {
  return scope.importerModule === scope.targetModule && scope.importerLayer === scope.target
    ? [{
        severity: 'error',
        rule: 'flow-violation',
        ...at,
        message: `Same-layer import "${at.subject}" via the alias — use a relative path or `
          + 'extract to a lower layer.',
      }]
    : [];
}

function allowedSelfOnlyFindings(
  scope: Parameters<typeof aliasDependencyFindings>[0],
  result: {
    targetPosition: ResolvedSourcePosition;
    verdict: ResolvedDependencyVerdict | null;
    at: { path: string; subject: string };
  },
): Finding[] {
  return result.verdict?.allowed
    && scope.importerLayer !== null
    && 'layer' in result.targetPosition
    && scope.ref.isExport
    && scope.selfOnly.includes(scope.target)
    ? [{
        severity: 'error',
        rule: 'selfonly-reexport',
        ...result.at,
        message: `Re-exports "${scope.target}" ("${scope.ref.specifier}"), which is selfOnly — `
          + 'depend on it, do not re-export it.',
      }]
    : [];
}

function dependencyFinding(
  verdict: ResolvedDependencyVerdict,
  at: { path: string; subject: string },
): Finding {
  const failed = [
    verdict.module ? null : `module reachability forbids "${verdict.importer.module}" → "${verdict.target.module}"`,
    verdict.inner ? null : `inner flow forbids "${verdict.importer.position}" → "${verdict.target.position}"`,
  ].filter((part): part is string => part !== null);

  return {
    severity: 'error',
    rule: 'flow-violation',
    ...at,
    message: `"${dependencyName(verdict.importer)}" may not import `
      + `"${dependencyName(verdict.target)}" ("${at.subject}") — ${failed.join('; ')}.`,
  };
}

function dependencyName(endpoint: ResolvedDependencyVerdict['importer']): string {
  return endpoint.module === null
    ? endpoint.position
    : `${endpoint.module}/${endpoint.position}`;
}
