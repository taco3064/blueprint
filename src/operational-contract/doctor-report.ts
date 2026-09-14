import type { DoctorCheckView } from './doctor';
import { CURRENT_CONFIG_ADOPTION_SCOPE } from './inspect';

export function renderDoctorReport(
  checks: DoctorCheckView[],
  report: { notes?: string[]; json?: boolean },
): string {
  const notes = report.notes ?? [];
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;
  const verdict = failed ? 'incomplete' : skipped ? 'unverified' : 'complete';
  const banner = doctorBanner({ checks: checks.length, failed, skipped, passed });

  if (report.json) {
    return JSON.stringify({
      ok: checks.every((check) => check.ok),
      verdict,
      scope: CURRENT_CONFIG_ADOPTION_SCOPE,
      summary: banner,
      counts: { total: checks.length, passed, failed, skipped },
      checks,
      note: notes.length ? notes.join('\n') : undefined,
    }, null, 2);
  }

  return [
    'blueprint doctor',
    'Scope: current-config adoption; this is not proof of a historical topology transformation.',
    ...checks.map(renderCheck),
    '',
    banner,
    ...notes.map((note) => `  ${note}`),
  ].join('\n');
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

  return `  ${mark} ${check.label}${under ? `\n      ${under}` : ''}`;
}
