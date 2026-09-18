import { describe, expect, it } from 'vitest';

import { lifecycleHistoryProblem } from './history';
import { withPlanIdentity } from './plan';
import type { LifecycleState, PendingUpgrade, UpgradeCatalog, UpgradeOperation } from './types';

function op(id: string, introducedIn: string): UpgradeOperation {
  return {
    id, introducedIn, requires: [], cancels: [], supersedes: [],
    applicability: { kind: 'always' }, verification: { kind: 'confirm' },
  };
}

const CATALOG: UpgradeCatalog = {
  supportedFrom: '3.2.0',
  legacyConfigCheckpoint: '3.2.0',
  retired: [],
  migrations: [
    {
      id: 'reshape',
      introducedIn: '4.0.0',
      supportsFrom: '3.2.0',
      applicability: { kind: 'always' },
    },
  ],
  operations: [op('review', '4.0.0'), op('tidy', '4.1.0')],
};

const PENDING: PendingUpgrade = withPlanIdentity({
  from: '3.2.0',
  to: '4.1.0',
  migrations: ['reshape'],
  operations: [
    { id: 'review', applications: ['.'], evidence: {}, supersedes: [] },
    { id: 'tidy', applications: ['.'], evidence: {}, supersedes: [] },
  ],
  completed: ['review'],
});

function state(patch: Partial<LifecycleState>): LifecycleState {
  return {
    schema: 1, blueprint: '3.2.0', provenance: 'complete', operations: [], pending: null,
    applications: {}, ...patch,
  };
}

describe('lifecycleHistoryProblem', () => {
  it('accepts history this catalog could have produced', () => {
    expect(lifecycleHistoryProblem(state({ pending: PENDING }), CATALOG)).toBeNull();

    const finished = state({ blueprint: '4.1.0', operations: ['review', 'tidy'] });

    expect(lifecycleHistoryProblem(finished, CATALOG)).toBeNull();

    expect(lifecycleHistoryProblem(state({
      blueprint: '4.1.0',
      pending: withPlanIdentity({
        from: '4.1.0', to: '4.1.0', migrations: [], operations: [], completed: [],
      }),
    }), CATALOG)).toBeNull();
  });

  it.each([
    ['an operation completed before the release that introduced it', { operations: ['review'] }],
    ['an operation this catalog never shipped', { blueprint: '4.1.0', operations: ['ghost'] }],
    [
      'completed operations without a completed lifecycle',
      { blueprint: null, operations: ['review'] },
    ],
  ])('refuses %s', (_, patch) => {
    expect(lifecycleHistoryProblem(state(patch), CATALOG)).toBe('operations');
  });

  const [review, tidy] = PENDING.operations;

  it.each<[string, Partial<PendingUpgrade>]>([
    [
      'an unknown executable operation',
      { operations: [{ ...review, id: 'ghost' }], completed: [] },
    ],
    [
      'an operation at or before the pending source',
      { from: '4.0.0', migrations: [], operations: [review], completed: [] },
    ],
    ['an operation beyond the pending target', { to: '4.0.0', operations: [review, tidy] }],
    ['an unknown migration', { migrations: ['ghost'] }],
    [
      'a migration at or before the pending source',
      { from: '4.0.0', operations: [tidy], completed: [] },
    ],
    ['a completion of an operation the plan does not hold', { completed: ['review', 'other'] }],
    ['a target before its source', { to: '3.1.0', operations: [], migrations: [], completed: [] }],
  ])('refuses a pending plan with %s', (_, patch) => {
    const pending = { ...PENDING, ...patch };

    expect(lifecycleHistoryProblem(state({ blueprint: pending.from, pending }), CATALOG))
      .toBe('pending');
  });

  it('refuses a pending plan that does not start at the recorded checkpoint', () => {
    expect(lifecycleHistoryProblem(state({ blueprint: '4.0.0', pending: PENDING }), CATALOG))
      .toBe('pending');
  });
});

describe('lifecycleHistoryProblem · after the supported window moves', () => {
  const MOVED: UpgradeCatalog = {
    ...CATALOG,
    supportedFrom: '4.0.0',
    migrations: [],
    operations: [op('tidy', '4.1.0')],
    retired: [{ id: 'review', introducedIn: '4.0.0' }],
  };

  it('keeps completed history readable once its operation retires', () => {
    const upgraded = state({ blueprint: '4.1.0', operations: ['review', 'tidy'] });

    expect(lifecycleHistoryProblem(upgraded, MOVED)).toBeNull();
    expect(lifecycleHistoryProblem(upgraded, { ...MOVED, retired: [] })).toBe('operations');
  });

  it('still dates a retired operation against the recorded checkpoint', () => {
    expect(lifecycleHistoryProblem(state({ blueprint: '3.2.0', operations: ['review'] }), MOVED))
      .toBe('operations');
  });

  it('never lets a pending plan hold an operation the running release no longer executes', () => {
    const pending = withPlanIdentity({
      from: '3.2.0', to: '4.1.0', migrations: [], completed: [],
      operations: [PENDING.operations[0]],
    });

    expect(lifecycleHistoryProblem(state({ pending }), MOVED)).toBe('pending');
  });
});
