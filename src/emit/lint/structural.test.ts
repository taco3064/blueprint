import { describe, expect, it } from 'vitest';

import {
  buildContainerPatterns,
  buildStructuralPatterns,
  normalizeGroupPatterns,
  normalizePathPatterns,
} from './structural';

describe('normalizeGroupPatterns', () => {
  it('deduplicates equivalent groups after normalizing their members', () => {
    expect(
      normalizeGroupPatterns([
        { group: ['@/components/**', '@/components/**'], message: 'blocked' },
        { group: ['@/components/**'], message: 'blocked' },
      ]),
    ).toEqual([{ group: ['@/components/**'], message: 'blocked' }]);
  });

  it('escapes positive and negated leading-hash patterns only', () => {
    expect(
      normalizeGroupPatterns([
        { group: ['#/router/**', '!#/router/public/**', '@/router/**'], message: 'blocked' },
      ]),
    ).toEqual([
      { group: ['\\#/router/**', '!\\#/router/public/**', '@/router/**'], message: 'blocked' },
    ]);
  });
});

describe('normalizePathPatterns', () => {
  const module = { name: '~app/auth', message: 'import the module entry' };
  const layer = { name: '~app/auth/hooks', message: 'import the layer entry' };

  it('keeps the first of two identical path patterns and drops the rest', () => {
    expect(normalizePathPatterns([module, layer, module, layer])).toEqual([module, layer]);
  });

  it('keeps patterns that differ only in their message', () => {
    const restated = { ...module, message: 'import the module entry instead' };

    expect(normalizePathPatterns([module, restated])).toEqual([module, restated]);
  });
});

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

  it('defaults structural targets to the current module', () => {
    const groups = buildStructuralPatterns({
      layer: 'views',
      module: 'auth',
      aliases: ['~app'],
      forbidden: ['services'],
      unitLayout: 'folder',
    });

    expect(groups.some((group) => group.group.includes('~app/auth/services'))).toBe(true);
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
