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
  report: { notes?: string[]; json?: boolean; prohibitions?: ProhibitionReportFact[];
    architectureFacts?: ArchitectureFactsView; },
): OperationalText {
  const notes = report.notes ?? [];
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;
  const verdict = failed ? 'incomplete' : skipped ? 'unverified' : 'complete';
  const banner = doctorBanner({ checks: checks.length, failed, skipped, passed });

  if (report.json) {
    return operationalText(JSON.stringify({
      ok: checks.every((check) => check.ok),
      verdict,
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
    'Scope: current-config adoption; this is not proof of a historical topology transformation.',
    ...checks.map(renderCheck),
    '',
    banner,
    ...notes.map((note) => `  ${note}`),
  ].join('\n'));
}

function doctorBanner(counts: {
  checks: number; failed: number; skipped: number; passed: number;
}): string {
  const { checks, failed, skipped, passed } = counts;

  if (failed === 0 && !skipped) {
    return `✓ Adoption complete — all ${checks} checks passed.`;
  }

  if (failed === 0) {
    return `⊘ Adoption unverified — ${passed} of ${checks} checks passed, `
      + `${skipped} could not run (⊘ above). Nothing failed, and nothing here `
      + 'proves what those checks cover.';
  }

  return `✗ Adoption incomplete — ${failed} of ${checks} check(s) failed`
    + `${skipped ? `, and ${skipped} could not run (⊘ above) — fixing the ✗ leaves those still unproven` : ''}.`;
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
