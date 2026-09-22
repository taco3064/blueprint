import { describe, expect, it } from 'vitest';

import { validateChangesetsRelease } from './release-changeset-gate.mjs';

describe('release Changesets SHA gate', () => {
  const valid = {
    version: '4.0.0',
    releaseFiles: [
      '.changeset/a.md',
      'CHANGELOG.md',
      'package-lock.json',
      'package.json',
    ],
    consumedChangesets: ['.changeset/a.md'],
    changelog: '# @kekkai/blueprint\n\n## 4.0.0\n\nRelease notes.\n',
    pendingChangesets: [],
  };

  it('accepts a consumed Changesets release with matching release notes', () => {
    expect(validateChangesetsRelease(valid)).toBe(true);
  });

  it.each([
    ['missing package version file', { releaseFiles: ['package-lock.json', 'CHANGELOG.md'] }],
    ['no consumed changeset', { consumedChangesets: [] }],
    ['missing changelog section', { changelog: '# @kekkai/blueprint\n\n## 3.2.0\n' }],
    ['pending changeset', { pendingChangesets: ['late-fix.md'] }],
  ])('rejects %s', (_name, patch) => {
    expect(() => validateChangesetsRelease({ ...valid, ...patch })).toThrow();
  });
});
