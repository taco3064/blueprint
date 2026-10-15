import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import type { AdoptionAssessment, AssessmentItem } from '../config';
import { deriveAdoptionAssessment } from '../inspect';
import type { PendingUpgrade } from '../lifecycle';
import type { UpgradeVerificationFact } from '../operational-contract';

export interface UpgradeAssessmentInput {
  pending: PendingUpgrade;
  migrations: { id: string; applications: string[] }[];
  reconciled: boolean;
  reconciledApplications: string[];
  verification: UpgradeVerificationFact[];
}

/** Reports bounded lifecycle records without clearing current-config semantic review. */
export function assessUpgrade(input: UpgradeAssessmentInput): AdoptionAssessment {
  const { pending } = input;

  const item = (value: Pick<AssessmentItem,
    'id' | 'application' | 'sourceKey' | 'lane' | 'status' | 'evidence'>): AssessmentItem => ({
    ...value,
    subject: value.sourceKey,
    claim: renderAssessmentClaim(value.id),
    source: 'lifecycle-upgrade',
    reach: null,
    limitations: ['bounded-workflow-record-not-semantic-proof'],
    signals: [],
    affectsExit: true,
    nextStep: value.status === 'review-required'
      ? renderAssessmentNextStep('complete-lifecycle-operation')
      : null,
  });

  const operations = pending.operations.flatMap((operation) =>
    operation.applications.map((application) => item({
      id: 'lifecycle-semantic-operation', application, sourceKey: operation.id, lane: 'review',
      status: pending.completed.includes(operation.id) ? 'review-recorded' : 'review-required',
      evidence: { operation, from: pending.from, to: pending.to, plan: pending.plan,
        completed: pending.completed.includes(operation.id) },
    })));

  const migrations = input.migrations.flatMap((migration) =>
    (migration.applications.length ? migration.applications : input.reconciledApplications)
      .map((application) => item({
        id: 'lifecycle-deterministic-migration', application, sourceKey: migration.id, lane: 'gate',
        status: input.reconciled ? 'passed' : 'unverified',
        evidence: { migration, from: pending.from, to: pending.to, reconciled: input.reconciled },
      })));

  const verification = input.verification.map((fact) => item({
    id: 'lifecycle-current-config-gates', application: fact.application,
    sourceKey: 'inspect-doctor',
    lane: 'gate', status: fact.inspect.ok ? fact.doctor.assessment.gates.status : 'failed',
    evidence: fact,
  }));

  return deriveAdoptionAssessment('lifecycle-upgrade', [...operations, ...migrations,
    ...verification]);
}
