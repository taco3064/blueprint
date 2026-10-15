import { describe, expect, it } from 'vitest';

import { globToRegExp } from './globs';

describe('portable glob compilation', () => {
  it('consumes a literal from first character to last', () => {
    const pattern = globToRegExp('tools/seed.ts');

    expect(pattern.source).toBe('^tools\\/seed\\.ts$');
    expect(pattern.test('tools/seed.ts')).toBe(true);
    expect(pattern.test('tools/seedXts')).toBe(false);
    expect(pattern.test('tools/seed.tsx')).toBe(false);
    expect(pattern.test('other/tools/seed.ts')).toBe(false);
  });

  it('compiles an empty glob without reading a character', () => {
    const pattern = globToRegExp('');

    expect(pattern.source).toBe('^$');
    expect(pattern.test('')).toBe(true);
    expect(pattern.test('tools/seed.ts')).toBe(false);
  });
});
