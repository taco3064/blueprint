import { describe, expect, it } from 'vitest';

import { buildContainerPatterns, buildStructuralPatterns } from './structural';

describe('buildStructuralPatterns · layer aliases', () => {
  it('uses a layer alias only for the layer it targets', () => {
    const groups = buildStructuralPatterns({
      layer: 'a',
      aliases: [{ alias: '~a', prefix: [], prepend: ['a'] }],
      forbidden: ['b'],
      unitLayout: 'folder',
      folderTargets: ['b'],
    });

    expect(groups.some((group) => group.group.includes('~a'))).toBe(true);
    expect(groups.some((group) => group.group.includes('~a/b/**'))).toBe(false);
  });
});

describe('buildContainerPatterns', () => {
  it('keeps only always-on relative guards when there are no folder targets', () => {
    const patterns = buildContainerPatterns({
      module: 'auth',
      aliases: ['~app'],
      folderTargets: [],
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0].group).toEqual(['./../**', '././**']);
  });
});
