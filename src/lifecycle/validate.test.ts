import { describe, expect, it } from 'vitest';

import { UPGRADE_CATALOG } from './catalog';
import { runningPackage } from './package';
import type { DeterministicMigration, UpgradeCatalog, UpgradeOperation } from './types';
import { catalogProblems } from './validate';

function op(
  id: string,
  introducedIn: string,
  extra: Record<string, unknown> = {},
): UpgradeOperation {
  return {
    id,
    introducedIn,
    requires: [],
    cancels: [],
    supersedes: [],
    applicability: { kind: 'always' },
    verification: { kind: 'confirm' },
    ...extra,
  } as UpgradeOperation;
}

function migration(id: string, extra: Record<string, unknown> = {}): DeterministicMigration {
  return {
    id, introducedIn: '1.1.0', supportsFrom: '1.0.0', applicability: { kind: 'always' }, ...extra,
  } as DeterministicMigration;
}

function problems(
  operations: UpgradeOperation[],
  extra: Partial<UpgradeCatalog> = {},
) {
  return catalogProblems({
    supportedFrom: '1.0.0',
    legacyConfigCheckpoint: '1.0.0',
    retired: [],
    migrations: [],
    operations,
    ...extra,
  }, '2.0.0');
}

describe('catalogProblems · the shipped catalog', () => {
  it('is valid for the running package version', () => {
    expect(catalogProblems(UPGRADE_CATALOG, runningPackage()!.version)).toEqual([]);
  });

  it('accepts a catalog with no upgrade operation at all', () => {
    expect(problems([])).toEqual([]);
  });
});

describe('catalogProblems · window and identity', () => {
  it.each([
    'supportedFrom',
    'legacyConfigCheckpoint',
  ] as const)('rejects a malformed %s', (where) => {
    expect(problems([op('x', '1.1.0')], { [where]: '1.0' }))
      .toEqual([{ kind: 'invalid-version', where, value: '1.0' }]);
  });

  it('rejects a supported window that starts after the package itself', () => {
    expect(problems([], { supportedFrom: '2.0.1' }))
      .toEqual([
        { kind: 'window-beyond-package', supportedFrom: '2.0.1', packageVersion: '2.0.0' },
      ]);

    expect(problems([], { supportedFrom: '2.0.0' })).toEqual([]);
  });

  it('rejects malformed and duplicate ids across migrations and operations', () => {
    expect(problems([op('Bad_Id', '1.1.0'), op('shared', '1.1.0'), op('bad_id', '1.1.0')], {
      migrations: [migration('shared')],
    })).toEqual([
      { kind: 'invalid-id', id: 'Bad_Id' },
      { kind: 'duplicate-id', id: 'shared' },
      { kind: 'invalid-id', id: 'bad_id' },
    ]);
  });

  it('checks nothing else about an entry whose id is not a string', () => {
    expect(problems([op(42 as never, '9.9.9', { requires: ['missing'] })]))
      .toEqual([{ kind: 'invalid-id', id: 42 }]);
  });

  it('rejects an entry whose release is malformed, future, or outside the window', () => {
    expect(problems([op('broken', '1.1'), op('future', '2.1.0'), op('stale', '1.0.0')]))
      .toEqual([
        { kind: 'invalid-version', where: 'broken.introducedIn', value: '1.1' },
        { kind: 'future-entry', id: 'future', introducedIn: '2.1.0', packageVersion: '2.0.0' },
        { kind: 'outside-window', id: 'stale', introducedIn: '1.0.0', supportedFrom: '1.0.0' },
      ]);
  });

  it('keeps retired operations as identities that stay outside the supported window', () => {
    expect(problems([op('current', '1.1.0')], {
      retired: [{ id: 'ancient', introducedIn: '0.9.0' }, { id: 'edge', introducedIn: '1.0.0' }],
    })).toEqual([]);

    expect(problems([op('current', '1.1.0')], {
      retired: [
        { id: 'current', introducedIn: '0.9.0' },
        { id: 'Bad', introducedIn: '0.9.0' },
        { id: 'early', introducedIn: '0.9' },
        { id: 'premature', introducedIn: '1.0.1' },
      ],
    })).toEqual([
      { kind: 'duplicate-id', id: 'current' },
      { kind: 'invalid-id', id: 'Bad' },
      { kind: 'invalid-version', where: 'early.introducedIn', value: '0.9' },
      { kind: 'retired-in-window', id: 'premature', introducedIn: '1.0.1', supportedFrom: '1.0.0' },
    ]);
  });

  it('rejects a migration that cannot migrate every supported source', () => {
    expect(problems([], {
      migrations: [
        migration('narrow', { supportsFrom: '1.0.5' }),
        migration('broken', { supportsFrom: 'x' }),
      ],
    })).toEqual([
      { kind: 'incomplete-window', id: 'narrow', supportsFrom: '1.0.5', supportedFrom: '1.0.0' },
      { kind: 'invalid-version', where: 'broken.supportsFrom', value: 'x' },
    ]);
  });
});

describe('catalogProblems · applicability and verification', () => {
  it.each([
    { kind: 'legacy-config-shape' },
    { kind: 'legacy-config-key', key: 'module.private' },
    { kind: 'source-below', version: '1.0.1' },
    { kind: 'source-below', version: '1.1.0' },
  ])('accepts applicability %j', (applicability) => {
    expect(problems([op('x', '1.1.0', { applicability })])).toEqual([]);
  });

  it.each([
    undefined,
    { kind: 'unknown' },
    { kind: 'unknown', version: '1.0.5' },
    { kind: 'legacy-config-key', key: 'architecture.alias' },
    { kind: 'source-below', version: 'soon' },
    { kind: 'source-below', version: '1.0.0' },
    { kind: 'source-below', version: '1.1.1' },
  ])('rejects applicability %j', (applicability) => {
    expect(problems([op('x', '1.1.0', { applicability })]))
      .toEqual([{ kind: 'malformed-applicability', id: 'x' }]);
  });

  it('checks migration applicability too', () => {
    expect(problems([], { migrations: [migration('m', { applicability: { kind: 'nope' } })] }))
      .toEqual([{ kind: 'malformed-applicability', id: 'm' }]);
  });

  it.each([
    { kind: 'no-files', pattern: 'blueprint.config.mjs.pre-v4-*' },
  ])('accepts verification %j', (verification) => {
    expect(problems([op('x', '1.1.0', { verification })])).toEqual([]);
  });

  it.each([
    undefined,
    { kind: 'lint' },
    { kind: 'no-files' },
    { kind: 'no-files', pattern: 'src/*.bak' },
    { kind: 'no-files', pattern: 'src\\*.bak' },
    { kind: 'no-files', pattern: '..backup' },
    { kind: 'no-files', pattern: '' },
  ])('rejects verification %j', (verification) => {
    expect(problems([op('x', '1.1.0', { verification })]))
      .toEqual([{ kind: 'malformed-verification', id: 'x' }]);
  });
});

describe('catalogProblems · relations', () => {
  it('rejects unknown, self, and non-list references', () => {
    expect(problems([
      op('a', '1.1.0', { requires: ['missing'], cancels: ['a'], supersedes: 'bb' }),
    ], { migrations: [migration('migration')] })).toEqual([
      { kind: 'unknown-reference', id: 'a', relation: 'requires', target: 'missing' },
      { kind: 'unknown-reference', id: 'a', relation: 'cancels', target: 'a' },
      { kind: 'unknown-reference', id: 'a', relation: 'supersedes', target: 'bb' },
    ]);
  });

  it('does not count a non-list relation as naming its target twice', () => {
    expect(problems([op('a', '1.1.0'), op('b', '1.2.0', { requires: ['a'], supersedes: 'a' })]))
      .toEqual([{ kind: 'unknown-reference', id: 'b', relation: 'supersedes', target: 'a' }]);
  });

  it('lets only supersession name a retired operation', () => {
    const retired = [
      { id: 'ancient', introducedIn: '0.9.0' },
      { id: 'older', introducedIn: '0.8.0' },
    ];

    expect(problems([op('b', '1.1.0', { supersedes: ['ancient'] })], { retired })).toEqual([]);

    expect(problems([op('c', '1.1.0', { requires: ['ancient'], cancels: ['older'] })], {
      retired,
    })).toEqual([
      { kind: 'unknown-reference', id: 'c', relation: 'requires', target: 'ancient' },
      { kind: 'unknown-reference', id: 'c', relation: 'cancels', target: 'older' },
    ]);
  });

  it('rejects a migration used as an operation reference', () => {
    expect(problems([op('a', '1.1.0', { requires: ['migration'] })], {
      migrations: [migration('migration')],
    })).toEqual([
      { kind: 'unknown-reference', id: 'a', relation: 'requires', target: 'migration' },
    ]);
  });

  it('rejects references that point forward in release history', () => {
    expect(problems([
      op('early', '1.1.0', { requires: ['late'] }),
      op('same', '1.1.0', { cancels: ['early'] }),
      op('late', '1.2.0', { supersedes: ['later'] }),
      op('later', '1.3.0'),
    ])).toEqual([
      { kind: 'impossible-reference', id: 'early', relation: 'requires', target: 'late' },
      { kind: 'impossible-reference', id: 'same', relation: 'cancels', target: 'early' },
      { kind: 'impossible-reference', id: 'late', relation: 'supersedes', target: 'later' },
    ]);
  });

  it('allows a requirement from the same release and skips ordering for malformed releases', () => {
    expect(problems([op('a', '1.1.0'), op('b', '1.1.0', { requires: ['a'] })])).toEqual([]);

    expect(problems([op('a', 'x'), op('b', '1.1.0', { requires: ['a'] })]))
      .toEqual([{ kind: 'invalid-version', where: 'a.introducedIn', value: 'x' }]);
  });

  it('rejects one target named by more than one relation', () => {
    expect(problems([
      op('a', '1.1.0'),
      op('b', '1.2.0', { requires: ['a'], cancels: ['a', 'a'] }),
    ])).toEqual([{ kind: 'conflicting-relations', id: 'b', target: 'a' }]);
  });

  it('skips relation checks for an operation whose id is already invalid', () => {
    expect(problems([op('Bad', '9.9.9', { requires: ['missing'] })]))
      .toEqual([{ kind: 'invalid-id', id: 'Bad' }]);
  });

  it('rejects a requirement cycle as a source the catalog cannot order', () => {
    expect(problems([
      op('a', '1.1.0', { requires: ['b'] }),
      op('b', '1.1.0', { requires: ['c'] }),
      op('c', '1.1.0', { requires: ['a'] }),
      op('d', '1.1.0', { requires: ['a'] }),
    ])).toEqual([{
      kind: 'unresolvable-source',
      source: '1.0.0',
      problem: { kind: 'dependency-cycle', ids: ['a', 'b', 'c', 'd'] },
    }]);
  });

  it('rejects a catalog that cannot resolve from a supported source', () => {
    expect(problems([
      op('base', '1.1.0'),
      op('needs', '1.2.0', { requires: ['base'] }),
      op('drop', '2.0.0', { cancels: ['base'] }),
    ])).toEqual([{
      kind: 'unresolvable-source',
      source: '1.0.0',
      problem: { kind: 'requires-canceled', id: 'needs', target: 'base', by: 'drop' },
    }]);
  });

  it('proves resolution with every legacy fact present', () => {
    const legacy = (key: string) => ({ applicability: { kind: 'legacy-config-key', key } });

    expect(problems([
      op('base', '1.1.0'),
      op('needs', '1.2.0', { requires: ['base'], ...legacy('module.private') }),
      op('drop', '2.0.0', { cancels: ['base'] }),
    ]).map((problem) => problem.kind)).toEqual(['unresolvable-source']);

    expect(problems([
      op('base', '1.1.0'),
      op('needs', '1.2.0', { requires: ['base'], applicability: { kind: 'legacy-config-shape' } }),
      op('drop', '2.0.0', { cancels: ['base'] }),
    ]).map((problem) => problem.kind)).toEqual(['unresolvable-source']);
  });
});
