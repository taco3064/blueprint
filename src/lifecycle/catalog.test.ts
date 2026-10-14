import { describe, expect, it } from 'vitest';

import { upgradeCatalogFor } from './catalog';
import { resolveUpgrade } from './resolve';
import { catalogProblems } from './validate';

const operation = {
  id: 'review-module-root-unit',
  introducedIn: '4.2.0',
  requires: [],
  cancels: [],
  supersedes: [],
  applicability: { kind: 'source-below', version: '4.2.0' },
  verification: { kind: 'confirm' },
};

describe('versioned root-unit review catalog', () => {
  it.each(['4.1.0', '4.2.0-rc.1'])('does not activate the operation before 4.2: %s', (version) => {
    expect(upgradeCatalogFor(version).operations.map((entry) => entry.id))
      .toEqual(['review-retired-module-private']);

    expect(catalogProblems(upgradeCatalogFor(version), version)).toEqual([]);
  });

  it.each(['4.2.0', '4.3.0'])('activates the exact manual contract: %s', (version) => {
    expect(upgradeCatalogFor(version).operations).toContainEqual(operation);
    expect(catalogProblems(upgradeCatalogFor(version), version)).toEqual([]);
  });

  it.each([
    { source: '4.1.0', target: '4.2.0', completed: [], expected: ['review-module-root-unit'] },
    { source: '4.2.0', target: '4.3.0', completed: [], expected: [] },
    { source: '4.1.0', target: '4.2.0', completed: ['review-module-root-unit'], expected: [] },
  ])('resolves $source through $target without replaying work', (example) => {
    const { source, target, completed, expected } = example;

    const result = resolveUpgrade({
      catalog: upgradeCatalogFor(target), source, target, completed,
      facts: [{ root: '.', legacyShape: false, legacyKeys: {} }],
    });

    expect(result.status).toBe('plan');

    if (result.status === 'plan') {
      expect(result.operations.map((entry) => entry.id)).toEqual(expected);
    }
  });
});
