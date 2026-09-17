import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { resolveUpgrade } from './resolve';
import type { UpgradePlan } from './resolve';
import type { UpgradeCatalog, UpgradeOperation } from './types';
import { catalogProblems } from './validate';

const RELEASES = ['1.1.0', '1.2.0', '1.3.0', '2.0.0'];
const facts = [{ root: '.', legacyShape: false, legacyKeys: {} }];

function catalogOf(operations: UpgradeOperation[]): UpgradeCatalog {
  return { supportedFrom: '1.0.0', legacyConfigCheckpoint: '1.0.0', migrations: [], operations };
}

function always(
  id: string,
  introducedIn: string,
  relations: Partial<Pick<UpgradeOperation, 'requires' | 'cancels' | 'supersedes'>> = {},
): UpgradeOperation {
  return {
    id,
    introducedIn,
    requires: [],
    cancels: [],
    supersedes: [],
    ...relations,
    applicability: { kind: 'always' },
    verification: { kind: 'confirm' },
  };
}

function execute(catalog: UpgradeCatalog, route: string[]): string[] {
  const executed: string[] = [];

  for (let step = 1; step < route.length; step++) {
    const plan = resolveUpgrade({
      catalog, source: route[step - 1], target: route[step], completed: executed, facts,
    }) as UpgradePlan;

    expect(plan.status).toBe('plan');
    executed.push(...plan.operations.map((operation) => operation.id));
  }

  return executed;
}

function retiredInInterval(catalog: UpgradeCatalog): Set<string> {
  return new Set(catalog.operations.flatMap((operation) => [
    ...operation.cancels,
    ...operation.supersedes,
  ]));
}

function expectConvergence(catalog: UpgradeCatalog, direct: string[], incremental: string[]): void {
  const retired = retiredInInterval(catalog);

  const skipped = incremental.filter((id) => !direct.includes(id));

  const owners = catalog.operations
    .filter((operation) => operation.supersedes.some((id) => skipped.includes(id)))
    .filter((operation) => !retired.has(operation.id))
    .map((operation) => operation.id);

  expect(direct.filter((id) => !incremental.includes(id))).toEqual([]);
  expect(skipped.filter((id) => !retired.has(id))).toEqual([]);
  expect(owners.filter((id) => !direct.includes(id))).toEqual([]);
}

const operationsArbitrary = fc.integer({ min: 1, max: 7 }).chain((count) =>
  fc.tuple(
    fc.array(
      fc.integer({ min: 0, max: RELEASES.length - 1 }),
      { minLength: count, maxLength: count },
    ),
    fc.array(fc.tuple(
      fc.integer({ min: 0, max: 6 }),
      fc.integer({ min: 0, max: 6 }),
      fc.constantFrom('requires', 'cancels', 'supersedes'),
    ), { maxLength: 8 }),
  ).map(([releases, relations]) => {
    const operations = [...releases].sort().map((release, index): UpgradeOperation => ({
      id: `op-${index}`,
      introducedIn: RELEASES[release],
      requires: [],
      cancels: [],
      supersedes: [],
      applicability: { kind: 'always' },
      verification: { kind: 'confirm' },
    }));

    for (const [from, to, relation] of relations) {
      const owner = operations[from];
      const target = operations[to];

      if (owner && target && !owner[relation].includes(target.id)) {
        (owner[relation] as string[]).push(target.id);
      }
    }

    return operations;
  }));

const routeArbitrary = fc.subarray(RELEASES.slice(0, -1))
  .map((stops) => ['1.0.0', ...stops, '2.0.0']);

describe('resolveUpgrade · route independence', () => {
  it('converges the documented 1.0 → 1.1 → 1.2 → 2.0 history with the direct jump', () => {
    const catalog = catalogOf([
      always('seed', '1.1.0'),
      always('temporary', '1.2.0'),
      always('final', '2.0.0', { cancels: ['temporary'], supersedes: ['seed'] }),
    ]);

    const direct = execute(catalog, ['1.0.0', '2.0.0']);
    const incremental = execute(catalog, ['1.0.0', '1.1.0', '1.2.0', '2.0.0']);

    expect(catalogProblems(catalog, '2.0.0')).toEqual([]);
    expect(direct).toEqual(['final']);
    expect(incremental).toEqual(['seed', 'temporary', 'final']);
    expectConvergence(catalog, direct, incremental);
  });

  it('keeps canceled history that already ran even when its canceler was superseded', () => {
    const catalog = catalogOf([
      always('a', '1.1.0'),
      always('b', '1.2.0', { cancels: ['a'] }),
      always('c', '1.3.0', { supersedes: ['b'] }),
    ]);

    expect(execute(catalog, ['1.0.0', '2.0.0'])).toEqual(['c']);
    expect(execute(catalog, ['1.0.0', '1.1.0', '2.0.0'])).toEqual(['a', 'c']);
  });

  it('runs every direct operation on every route and only retired history beyond it', () => {
    fc.assert(fc.property(operationsArbitrary, routeArbitrary, (operations, route) => {
      const catalog = catalogOf(operations);

      fc.pre(catalogProblems(catalog, '2.0.0').length === 0);

      expectConvergence(catalog, execute(catalog, ['1.0.0', '2.0.0']), execute(catalog, route));
    }), { numRuns: 500 });
  });

  it('orders every plan so each requirement runs before its dependent', () => {
    fc.assert(fc.property(operationsArbitrary, (operations) => {
      const catalog = catalogOf(operations);

      fc.pre(catalogProblems(catalog, '2.0.0').length === 0);

      const order = execute(catalog, ['1.0.0', '2.0.0']);

      for (const operation of operations.filter((entry) => order.includes(entry.id))) {
        for (const required of operation.requires.filter((id) => order.includes(id))) {
          expect(order.indexOf(required)).toBeLessThan(order.indexOf(operation.id));
        }
      }
    }), { numRuns: 300 });
  });
});
