import type { LintEntrypointAssessment } from '../project';
import type { LiveLintEvidence } from './lint-runtime';
import type { DoctorCheck } from './types';

export function liveLintCheck(
  evidence: LiveLintEvidence,
  assessment: LintEntrypointAssessment,
): DoctorCheck {
  const label = 'reachable eslint leg passes live';

  if (!assessment.reachable) {
    return {
      label: `${label} (skipped — no reachable eslint leg)`,
      ok: true,
      skipped: 'the normal lint entrypoint check above is the red for that',
    };
  }

  if (evidence.status === 'unverified') {
    return {
      label: `${label} (skipped — safe execution unavailable)`,
      ok: true,
      skipped: `${evidence.command ? `\`${evidence.command}\` — ` : ''}${evidence.reason}`,
    };
  }

  const totals = `${evidence.errors} error(s), ${evidence.warnings} warning(s)`;
  const detail = `\`${evidence.command}\` — ${totals}`;

  return evidence.status === 'passed'
    ? { label, ok: true, detail }
    : {
        label,
        ok: false,
        detail: `${detail}; ${evidence.reason ?? 'the native ESLint gate failed'}`,
      };
}
