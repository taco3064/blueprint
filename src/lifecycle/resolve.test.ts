import { describe, expect, it } from 'vitest';

import { resolveUpgrade } from './resolve';
import type { ResolveUpgradeInput, UpgradePlan } from './resolve';
import type {
  ApplicationFacts,
  DeterministicMigration,
  UpgradeApplicability,
  UpgradeCatalog,
  UpgradeOperation,
} from './types';

const app: ApplicationFacts = { root: '.', legacyShape: false, legacyKeys: {} };

function op(id: string, introducedIn: string, relations: Partial<UpgradeOperation> = {}) {
  return {
    id,
    introducedIn,
    requires: [],
    cancels: [],
    supersedes: [],
    applicability: { kind: 'always' },
    verification: { kind: 'confirm' },
    ...relations,
  } as UpgradeOperation;
}

function migration(
  id: string,
  introducedIn: string,
  applicability: UpgradeApplicability,
): DeterministicMigration {
  return { id, introducedIn, supportsFrom: '1.0.0', applicability };
}

function catalog(operations: UpgradeOperation[]): UpgradeCatalog {
  return {
    supportedFrom: '1.0.0',
    legacyConfigCheckpoint: '1.0.0',
    migrations: [],
    operations,
  };
}

function resolve(input: Partial<ResolveUpgradeInput> & { catalog: UpgradeCatalog }) {
  return resolveUpgrade({
    source: '1.0.0', target: '2.0.0', completed: [], facts: [app], ...input,
  });
}

function planIds(input: Partial<ResolveUpgradeInput> & { catalog: UpgradeCatalog }): string[] {
  const resolution = resolve(input) as UpgradePlan;

  expect(resolution.status).toBe('plan');

  return resolution.operations.map((operation) => operation.id);
}

describe('resolveUpgrade · interval boundaries', () => {
  it('refuses a source below the supported window with the checkpoint to reach', () => {
    expect(resolve({ catalog: catalog([]), source: '0.9.0' }))
      .toEqual({ status: 'unsupported', checkpoint: '1.0.0' });
  });

  it('accepts the supported checkpoint itself as a source', () => {
    expect(resolve({ catalog: catalog([]), source: '1.0.0' }).status).toBe('plan');
  });

  it('rejects a downgrade and reports an equal version as current', () => {
    expect(resolve({ catalog: catalog([]), source: '2.0.0', target: '1.1.0' }))
      .toEqual({ status: 'downgrade' });

    expect(resolve({ catalog: catalog([]), source: '2.0.0', target: '2.0.0' }))
      .toEqual({ status: 'current' });
  });

  it('collects operations after the source and up to the target only', () => {
    const operations = [
      op('at-source', '1.0.0'), op('inside', '1.1.0'), op('at-target', '2.0.0'),
      op('beyond', '2.0.1'),
    ];

    expect(planIds({ catalog: catalog(operations) })).toEqual(['inside', 'at-target']);
  });

  it('orders by release, then catalog position, when nothing requires otherwise', () => {
    const operations = [op('late', '1.2.0'), op('early-b', '1.1.0'), op('early-a', '1.1.0')];

    expect(planIds({ catalog: catalog(operations) })).toEqual(['early-b', 'early-a', 'late']);
  });

  it('never re-plans an operation this repository already completed', () => {
    const operations = [op('done', '1.1.0'), op('open', '1.2.0')];

    expect(planIds({ catalog: catalog(operations), completed: ['done'] })).toEqual(['open']);
  });
});

describe('resolveUpgrade · cumulative relations', () => {
  it('drops an older pending operation that a later release in the interval cancels', () => {
    const resolution = resolve({
      catalog: catalog([op('old', '1.1.0'), op('cleanup', '2.0.0', { cancels: ['old'] })]),
    }) as UpgradePlan;

    expect(resolution.operations.map((operation) => operation.id)).toEqual(['cleanup']);
    expect(resolution.suppressed).toEqual([{ id: 'old', relation: 'cancel', by: 'cleanup' }]);
  });

  it('keeps completed history when a later release cancels it', () => {
    const resolution = resolve({
      catalog: catalog([op('old', '1.1.0'), op('cleanup', '2.0.0', { cancels: ['old'] })]),
      source: '1.1.0',
      completed: ['old'],
    }) as UpgradePlan;

    expect(resolution.operations.map((operation) => operation.id)).toEqual(['cleanup']);
    expect(resolution.suppressed).toEqual([]);
  });

  it('lets a superseding operation own the final state and names the history it converges', () => {
    const operations = [op('first', '1.1.0'), op('final', '2.0.0', { supersedes: ['first'] })];
    const direct = resolve({ catalog: catalog(operations) }) as UpgradePlan;

    const incremental = resolve({
      catalog: catalog(operations), source: '1.1.0', completed: ['first'],
    }) as UpgradePlan;

    expect(direct.operations).toEqual([expect.objectContaining({
      id: 'final', supersedes: [{ id: 'first', completed: false }],
    })]);

    expect(direct.suppressed).toEqual([{ id: 'first', relation: 'supersede', by: 'final' }]);

    expect(incremental.operations).toEqual([expect.objectContaining({
      id: 'final', supersedes: [{ id: 'first', completed: true }],
    })]);
  });

  it('ignores relations that point before the interval', () => {
    const operations = [op('ancient', '1.0.0'), op('now', '1.1.0', { cancels: ['ancient'] })];

    expect((resolve({ catalog: catalog(operations) }) as UpgradePlan).suppressed).toEqual([]);
  });

  it('lets the latest relation to the same target win', () => {
    const operations = [
      op('base', '1.1.0'),
      op('replace', '1.2.0', { supersedes: ['base'] }),
      op('drop', '1.3.0', { cancels: ['base'] }),
    ];

    expect((resolve({ catalog: catalog(operations) }) as UpgradePlan).suppressed)
      .toEqual([{ id: 'base', relation: 'cancel', by: 'drop' }]);
  });

  it('orders a requirement before its dependent, following supersession to the owner', () => {
    const operations = [
      op('dependent', '1.1.0', { requires: ['setup'] }),
      op('setup', '1.1.0'),
      op('setup-v2', '1.2.0', { supersedes: ['setup'] }),
      op('after', '1.3.0', { requires: ['dependent'] }),
    ];

    expect(planIds({ catalog: catalog(operations) })).toEqual(['setup-v2', 'dependent', 'after']);
  });

  it('treats a requirement as met when it is completed, inapplicable, or outside the plan', () => {
    const operations = [
      op('done', '1.1.0'),
      op('elsewhere', '1.1.0', { applicability: { kind: 'legacy-config-shape' } }),
      op('needs', '1.2.0', { requires: ['done', 'elsewhere', 'ancient'] }),
      op('ancient', '0.9.0'),
    ];

    expect(planIds({ catalog: catalog(operations), completed: ['done'] })).toEqual(['needs']);
  });

  it('reports a requirement on an operation a later release canceled', () => {
    const operations = [
      op('base', '1.1.0'),
      op('needs', '1.2.0', { requires: ['base'] }),
      op('drop', '2.0.0', { cancels: ['base'] }),
    ];

    expect(resolve({ catalog: catalog(operations) })).toEqual({
      status: 'invalid',
      problems: [{ kind: 'requires-canceled', id: 'needs', target: 'base', by: 'drop' }],
    });
  });

  it('reports a requirement cycle instead of choosing an order', () => {
    const operations = [
      op('a', '1.1.0', { requires: ['b'] }),
      op('b', '1.1.0', { requires: ['a'] }),
      op('free', '1.1.0'),
    ];

    expect(resolve({ catalog: catalog(operations) })).toEqual({
      status: 'invalid',
      problems: [{ kind: 'dependency-cycle', ids: ['a', 'b'] }],
    });
  });

  it('ignores an operation that requires itself for ordering', () => {
    expect(planIds({ catalog: catalog([op('self', '1.1.0', { requires: ['self'] })]) }))
      .toEqual(['self']);
  });
});

describe('resolveUpgrade · applicability and migrations', () => {
  const legacy: ApplicationFacts = {
    root: 'apps/old', legacyShape: true, legacyKeys: { 'module.private': ['hooks'] },
  };

  it('scopes operations to the applications whose facts match and lists the rest', () => {
    const operations = [
      op('private', '1.1.0', {
        applicability: { kind: 'legacy-config-key', key: 'module.private' },
      }),
      op('shape', '1.1.0', { applicability: { kind: 'legacy-config-shape' } }),
      op('old-source', '1.1.0', { applicability: { kind: 'source-below', version: '1.0.5' } }),
      op('young-source', '1.1.0', { applicability: { kind: 'source-below', version: '1.0.0' } }),
    ];

    const resolution = resolve({
      catalog: catalog(operations), facts: [app, legacy],
    }) as UpgradePlan;

    expect(resolution.operations).toEqual([
      {
        id: 'private',
        applications: ['apps/old'],
        evidence: { 'apps/old': ['hooks'] },
        supersedes: [],
      },
      { id: 'shape', applications: ['apps/old'], evidence: {}, supersedes: [] },
      { id: 'old-source', applications: ['.', 'apps/old'], evidence: {}, supersedes: [] },
    ]);

    expect(resolution.inapplicable).toEqual(['young-source']);
  });

  it('plans deterministic migrations in the interval that apply to an application', () => {
    const migrating: UpgradeCatalog = {
      ...catalog([]),
      migrations: [
        migration('shape', '1.1.0', { kind: 'legacy-config-shape' }),
        migration('always', '2.0.0', { kind: 'always' }),
        migration('past', '1.0.0', { kind: 'always' }),
        migration('unused', '1.2.0', { kind: 'legacy-config-shape' }),
      ],
    };

    expect((resolve({ catalog: migrating, facts: [legacy] }) as UpgradePlan).migrations).toEqual([
      { id: 'shape', applications: ['apps/old'] },
      { id: 'unused', applications: ['apps/old'] },
      { id: 'always', applications: ['apps/old'] },
    ]);

    expect((resolve({ catalog: migrating, facts: [app] }) as UpgradePlan).migrations)
      .toEqual([{ id: 'always', applications: ['.'] }]);
  });
});
