import type { LintEntrypointAssessment } from '../project';
import { renderDoctorCheck } from '../operational-contract';
import type { LiveLintEvidence } from './lint-runtime';
import type { DoctorCheck } from './types';

export function liveLintCheck(
  evidence: LiveLintEvidence,
  assessment: LintEntrypointAssessment,
): DoctorCheck {
  if (!assessment.reachable) {
    return renderDoctorCheck({ kind: 'live-lint', status: 'unreachable' });
  }

  if (evidence.status === 'unverified') {
    return renderDoctorCheck({
      kind: 'live-lint',
      status: 'unverified',
      ...(evidence.command ? { command: evidence.command } : {}),
      reason: String(evidence.reason),
    });
  }

  return renderDoctorCheck({
    kind: 'live-lint',
    status: evidence.status,
    command: String(evidence.command),
    errors: evidence.errors,
    warnings: evidence.warnings,
    ...(evidence.reason ? { reason: evidence.reason } : {}),
  });
}
