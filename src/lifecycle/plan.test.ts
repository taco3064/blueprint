import { describe, expect, it } from 'vitest';

import { planIdentity, withPlanIdentity } from './plan';
import type { PlannedUpgrade } from './plan';
import type { PendingOperation } from './types';

const PLAN: PlannedUpgrade = {
  from: '4.0.0',
  to: '4.1.0',
  migrations: ['reshape'],
  completed: [],
  operations: [{
    id: 'converge',
    applications: ['.', 'apps/web'],
    evidence: { '.': ['hooks'], 'apps/web': ['styles'] },
    supersedes: [{ id: 'seed', completed: true }],
  }],
};

function changed(patch: Partial<PendingOperation>): PlannedUpgrade {
  return { ...PLAN, operations: [{ ...PLAN.operations[0], ...patch }] };
}

describe('planIdentity', () => {
  it('signs a plan with a digest of its immutable part', () => {
    expect(withPlanIdentity(PLAN)).toEqual({ ...PLAN, plan: planIdentity(PLAN) });
    expect(planIdentity(PLAN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores completion progress and the order evidence was recorded in', () => {
    expect(planIdentity({ ...PLAN, completed: ['converge'] })).toBe(planIdentity(PLAN));

    expect(planIdentity(changed({ evidence: { 'apps/web': ['styles'], '.': ['hooks'] } })))
      .toBe(planIdentity(PLAN));
  });

  it.each<[string, Partial<PendingOperation>]>([
    ['the superseded operation', { supersedes: [{ id: 'other', completed: true }] }],
    ['whether the superseded operation ran', { supersedes: [{ id: 'seed', completed: false }] }],
    ['the measured evidence', { evidence: { '.': ['types'], 'apps/web': ['styles'] } }],
    ['the applications in scope', { applications: ['.'] }],
  ])('changes when %s changes', (_, patch) => {
    expect(planIdentity(changed(patch))).not.toBe(planIdentity(PLAN));
  });
});
