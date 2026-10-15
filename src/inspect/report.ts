import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { renderArchitectureReport } from '../operational-contract';
import type { importAnalysis } from './scan';
import type { Finding, ScanResult } from './types';

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function report(
  findings: Finding[],
  architecture?: ArchitectureDef,
  facts?: {
    analysis: ReturnType<typeof importAnalysis>; outsideScope?: ScanResult['outsideScope'];
  },
): string {
  const topology = architecture === undefined
    ? undefined
    : resolveArchitecture(architecture).topology === 'module-first'
      ? 'Module → Layer → Unit' as const
      : 'Layer → Unit' as const;

  return renderArchitectureReport(findings, {
    ...(topology ? { topology } : {}),
    importGraph: facts?.analysis ?? null,
    outsideScope: facts?.outsideScope,
  });
}
