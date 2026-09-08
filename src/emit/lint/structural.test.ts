import { describe, expect, it } from 'vitest';

import { buildStructuralPatterns } from './structural';

describe('buildStructuralPatterns · layer aliases', () => {
  it('uses a layer alias only for the layer it targets', () => {
    const groups = buildStructuralPatterns({
      layer: 'a',
      aliases: [{ alias: '~a', prefix: [], prepend: ['a'] }],
      forbidden: ['b'],
      moduleLayout: 'folder',
      folderTargets: ['b'],
    });

    expect(groups.some((group) => group.group.includes('~a'))).toBe(true);
    expect(groups.some((group) => group.group.includes('~a/b/**'))).toBe(false);
  });
});
