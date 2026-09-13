import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { renderArchitectureReport } from '../operational-contract';
import { importAnalysis } from './scan';
import type { Finding, ScanResult } from './types';

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function report(
  findings: Finding[],
  architecture?: ArchitectureDef,
  scan?: ScanResult,
): string {
  const topology = architecture === undefined
    ? undefined
    : resolveArchitecture(architecture).topology === 'module-first'
      ? 'Module → Layer → Unit' as const
      : 'Layer → Unit' as const;

  return renderArchitectureReport(findings, {
    ...(topology ? { topology } : {}),
    importGraph: scan === undefined ? null : importAnalysis(scan),
  });
}
