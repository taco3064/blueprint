import { resolveArchitecture } from '../config';
import type { Blueprint, ResolvedArchitecture } from '../config';
import { analyze } from './analyze';
import { collectOutsideScope } from './outside-scope';
import { importAnalysis, scan } from './scan';
import type { Finding, OutsideScopeEvidence, ScanResult } from './types';

export type ArchitectureDemand = 'governed-source' | 'application-scope';

export interface ArchitectureFacts {
  demand: ArchitectureDemand;
  resolved: ResolvedArchitecture;
  scanResult: ScanResult;
  outsideScope: OutsideScopeEvidence;
  findings: Finding[];
  analysis: ReturnType<typeof importAnalysis>;
  scopeComplete: boolean;
}

export function collectArchitectureFacts(
  root: string,
  blueprint: Blueprint,
  options: { demand: ArchitectureDemand; dependencies?: string[] },
): ArchitectureFacts {
  const { demand } = options;
  const resolved = resolveArchitecture(blueprint.architecture);
  const scanResult = scan(root, resolved.sourceRoot);

  const outsideScope = demand === 'application-scope'
    ? collectOutsideScope(root, resolved, scanResult)
    : { status: 'not-requested' as const };

  scanResult.outsideScope = outsideScope;

  const outsideFiles = 'files' in outsideScope ? outsideScope.files : [];
  const analysis = importAnalysis({ ...scanResult, files: [...scanResult.files, ...outsideFiles] });

  return {
    demand,
    resolved,
    scanResult,
    outsideScope,
    findings: analyze(scanResult, blueprint, { ...options, resolved }),
    analysis,
    scopeComplete: outsideScope.status === 'complete' || outsideScope.status === 'not-applicable',
  };
}
