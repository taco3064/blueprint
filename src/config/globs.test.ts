import { describe, expect, it } from 'vitest';

import { globToRegExp } from './globs';

describe('portable glob compilation', () => {
  it('treats a closing brace without an opening brace as literal text', () => {
    const pattern = globToRegExp('a}');

    expect(pattern.source).toBe('^a\\}$');
    expect(pattern.test('a}')).toBe(true);
    expect(pattern.test('')).toBe(false);
    expect(pattern.test('a')).toBe(false);
  });

  it('consumes a literal from first character to last', () => {
    const pattern = globToRegExp('tools/seed.ts');

    expect(pattern.source).toBe('^tools\\/seed\\.ts$');
    expect(pattern.test('tools/seed.ts')).toBe(true);
    expect(pattern.test('tools/seedXts')).toBe(false);
    expect(pattern.test('tools/seed.tsx')).toBe(false);
    expect(pattern.test('other/tools/seed.ts')).toBe(false);
  });

  it('consumes a leading double star and its directory separator', () => {
    const pattern = globToRegExp('**/');

    expect(pattern.source).toBe('^(?:.*\\/)?$');
    expect(pattern.test('')).toBe(true);
    expect(pattern.test('src/')).toBe(true);
    expect(pattern.test('src/nested/')).toBe(true);
    expect(pattern.test('src')).toBe(false);
    expect(pattern.test('src/nested')).toBe(false);
  });

  it('compiles an empty glob without reading a character', () => {
    const pattern = globToRegExp('');

    expect(pattern.source).toBe('^$');
    expect(pattern.test('')).toBe(true);
    expect(pattern.test('tools/seed.ts')).toBe(false);
  });
});
