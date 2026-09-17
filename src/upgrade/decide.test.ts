import { describe, expect, it, vi } from 'vitest';

import { decideUpgrade } from './decide';
import type { UpgradeFacts } from './facts';

vi.mock('../lifecycle', async (original) => ({
  ...await original<typeof import('../lifecycle')>(),
  resolveUpgrade: () => ({
    status: 'invalid',
    problems: [{ kind: 'dependency-cycle', ids: ['a', 'b'] }],
  }),
}));

describe('decideUpgrade · defense against a resolution the catalog check did not predict', () => {
  it('refuses instead of executing an unordered plan', () => {
    const facts: UpgradeFacts = {
      root: '/repo',
      applications: [{
        key: '.',
        root: '/repo',
        installed: { root: '/repo/node_modules/@kekkai/blueprint', version: '4.0.0' },
        manifest: { root: '/repo', section: 'devDependencies' },
        packageManager: 'npm',
        facts: { root: '.', legacyShape: false, legacyKeys: {} },
      }],
      state: { status: 'missing' },
      checkpoint: { kind: 'bootstrap', version: '4.0.0', evidence: 'installed-package' },
      git: { repository: true, changes: [] },
      workflows: [],
      unreadable: null,
    };

    expect(decideUpgrade({
      facts,
      running: { root: '/runner', version: '4.1.0' },
      catalog: {
        supportedFrom: '3.2.0', legacyConfigCheckpoint: '3.2.0', migrations: [], operations: [],
      },
      installSpec: '@kekkai/blueprint@4.1.0',
      hasInstruction: () => true,
    })).toEqual({
      kind: 'refuse',
      refusal: { kind: 'invalid-catalog', problems: ['dependency-cycle'] },
    });
  });
});
