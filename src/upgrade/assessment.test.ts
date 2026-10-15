import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import { describe, expect, it } from 'vitest';

import { deriveAdoptionAssessment } from '../inspect';
import type { PendingUpgrade } from '../lifecycle';
import { assessUpgrade } from './assessment';
import type { UpgradeAssessmentInput } from './assessment';

const pending: PendingUpgrade = {
  from: '4.0.0', to: '4.2.0', plan: 'plan-identity', migrations: ['config'],
  completed: ['ownership'], operations: [
    { id: 'ownership', applications: ['apps/web', 'apps/admin'],
      evidence: { 'apps/web': ['reviewed'] }, supersedes: [] },
    { id: 'placement', applications: ['apps/web'], evidence: {}, supersedes: [] },
  ],
};

function input(): UpgradeAssessmentInput {
  return { pending, reconciled: true, reconciledApplications: ['apps/web', 'apps/admin'],
    migrations: [{ id: 'config', applications: ['apps/web', 'apps/admin'] }],
    verification: [{ application: 'apps/web', inspect: { ok: true, findings: 0 },
      doctor: { assessment: deriveAdoptionAssessment('current-config-adoption', []),
        failed: [], skipped: [] } }],
  };
}

describe('assessUpgrade', () => {
  it('retains application evidence and distinguishes pending from recorded review', () => {
    const result = assessUpgrade(input());
    const operations = result.items.filter((item) => item.id === 'lifecycle-semantic-operation');

    expect(result.scope).toBe('lifecycle-upgrade');
    expect(result.review).toEqual({ status: 'required', required: 1, recorded: 2 });

    expect(operations).toEqual([
      ...['apps/web', 'apps/admin'].map((application) => ({
        id: 'lifecycle-semantic-operation', application, sourceKey: 'ownership',
        lane: 'review', status: 'review-recorded', subject: 'ownership',
        claim: renderAssessmentClaim('lifecycle-semantic-operation'),
        source: 'lifecycle-upgrade', reach: null,
        limitations: ['bounded-workflow-record-not-semantic-proof'], signals: [],
        affectsExit: true, nextStep: null,
        evidence: { operation: pending.operations[0], from: pending.from, to: pending.to,
          plan: pending.plan, completed: true },
      })),
      {
        id: 'lifecycle-semantic-operation', application: 'apps/web', sourceKey: 'placement',
        lane: 'review', status: 'review-required', subject: 'placement',
        claim: renderAssessmentClaim('lifecycle-semantic-operation'),
        source: 'lifecycle-upgrade', reach: null,
        limitations: ['bounded-workflow-record-not-semantic-proof'], signals: [],
        affectsExit: true, nextStep: renderAssessmentNextStep('complete-lifecycle-operation'),
        evidence: { operation: pending.operations[1], from: pending.from, to: pending.to,
          plan: pending.plan, completed: false },
      },
    ]);
  });

  it.each([true, false])('reports reconciliation independently with reconciled=%s',
    (reconciled) => {
      const result = assessUpgrade({ ...input(), reconciled });

      const migrations = result.items.filter((item) =>
        item.id === 'lifecycle-deterministic-migration');

      expect(migrations).toHaveLength(2);

      expect(migrations.map((item) => [item.application, item.status, item.evidence])).toEqual(
        ['apps/web', 'apps/admin'].map((application) => [application,
          reconciled ? 'passed' : 'unverified', {
            migration: input().migrations[0], from: pending.from, to: pending.to, reconciled,
          }]),
      );

      expect(result.gates).toEqual({ status: reconciled ? 'passed' : 'unverified',
        failed: 0, unverified: reconciled ? 0 : 2 });
    });

  it.each([
    [true, 'passed', 'passed'], [false, 'passed', 'failed'],
    [true, 'failed', 'failed'], [true, 'unverified', 'unverified'],
  ] as const)('combines inspect=%s and Doctor=%s as bounded gate %s', (ok, status, expected) => {
    const value = input();
    const fact = value.verification[0]!;

    fact.inspect.ok = ok;
    fact.doctor.assessment.gates.status = status;
    const result = assessUpgrade(value);
    const gate = result.items.find((item) => item.id === 'lifecycle-current-config-gates');

    expect(gate).toMatchObject({ application: 'apps/web', status: expected,
      sourceKey: 'inspect-doctor', lane: 'gate', evidence: fact, nextStep: null });

    expect(result.gates.status).toBe(expected);
    expect(result.review.required).toBe(1);
  });

  it('preserves declared scope and uses measured applications for resumed migrations', () => {
    const value = input();

    value.migrations = [
      { id: 'scoped', applications: ['apps/admin'] },
      { id: 'resumed', applications: [] },
    ];

    const result = assessUpgrade(value);

    expect(result.items.filter((item) => item.id === 'lifecycle-deterministic-migration')
      .map((item) => [item.sourceKey, item.application])).toEqual([
      ['resumed', 'apps/web'], ['resumed', 'apps/admin'], ['scoped', 'apps/admin'],
    ]);

    value.reconciledApplications = [];

    expect(assessUpgrade(value).items.filter((item) =>
      item.id === 'lifecycle-deterministic-migration').map((item) => item.sourceKey))
      .toEqual(['scoped']);
  });

  it('does not invent operations, migrations, or verification for empty workflow records', () => {
    const result = assessUpgrade({ pending: { ...pending, operations: [], completed: [] },
      migrations: [], reconciled: false, reconciledApplications: [], verification: [] });

    expect(result.items).toEqual([]);
    expect(result.review).toEqual({ status: 'none-known', required: 0, recorded: 0 });
    expect(result.scope).toBe('lifecycle-upgrade');
  });
});
