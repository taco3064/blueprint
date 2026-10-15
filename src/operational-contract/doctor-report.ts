import type { AdoptionAssessment } from '../config';
import { renderAssessment, renderAssessmentHeadline } from './adoption-assessment';
import type { DoctorCheckView } from './doctor';
import { CURRENT_CONFIG_ADOPTION_SCOPE } from './inspect';
import type { ImportGraphFact } from './inspect';
import type { OutsideScopeView } from './outside-scope';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';
import type { ProhibitionReportFact } from './prohibitions';

export interface ArchitectureFactsView {
  outsideScope: OutsideScopeView;
  governedWork?: { inventoryFiles: number; readFiles: number; parsedFiles: number };
  importAnalysis: ImportGraphFact;
  applicationScope: { rule: string; path: string; subject: string }[];
}

export function renderDoctorReport(
  checks: DoctorCheckView[],
  report: { assessment: AdoptionAssessment; workflowAssessments?: AdoptionAssessment[];
    notes?: string[]; json?: boolean; prohibitions?: ProhibitionReportFact[];
    architectureFacts?: ArchitectureFactsView; },
): OperationalText {
  const notes = report.notes ?? [];
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;
  const verdict = failed ? 'incomplete' : skipped ? 'unverified' : 'complete';
  const banner = renderAssessmentHeadline(report.assessment.headline);

  if (report.json) {
    return operationalText(JSON.stringify({
      ok: checks.every((check) => check.ok),
      verdict, gateVerdict: verdict, assessment: report.assessment,
      workflowAssessments: report.workflowAssessments ?? [],
      scope: CURRENT_CONFIG_ADOPTION_SCOPE,
      summary: banner,
      counts: { total: checks.length, passed, failed, skipped },
      checks,
      ...(report.architectureFacts ? { architectureFacts: report.architectureFacts } : {}),
      ...(report.prohibitions ? { prohibitions: report.prohibitions } : {}),
      note: notes.length ? notes.join('\n') : undefined,
    }, null, 2));
  }

  return operationalText([
    'blueprint doctor',
    ...renderAssessment(report.assessment),
    'Scope: current-config adoption; this is not proof of a historical topology transformation.',
    ...checks.map(renderCheck),
    '',
    banner,
    ...notes.map((note) => `  ${note}`),
    ...(report.workflowAssessments ?? []).flatMap(renderAssessment),
  ].join('\n'));
}

function renderCheck(check: DoctorCheckView): string {
  const mark = check.ok ? (check.skipped ? '⊘' : '✓') : '✗';
  const under = check.skipped ?? check.detail;

  return [
    `  ${mark} ${check.label}${under ? `\n      ${under}` : ''}`,
    ...(check.prohibitionFindings ?? []).map((finding) =>
      `      ${finding.filePath}: ${finding.message} (severity: ${finding.severity}; `
      + `gate: ${finding.gate}; observation: ${finding.observation}; `
      + `affectsExit: ${finding.affectsExit})`),
  ].join('\n');
}
