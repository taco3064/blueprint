import { describe, expect, it } from 'vitest';
import { transformationMemberIdentity } from './import-reference';

describe('transformation member identity', () => {
  it.each([
    'import value from \'./old\';\nexport default value;',
    'export { value } from \'./old\';',
    'export * from \'./old\';',
    'const value = import(\'./old\');',
    '<script setup>import value from \'./old\';</script><template><p>{{ value }}</p></template>',
  ])('normalizes only parsed literal module specifiers in %s', (source) => {
    const file = source.startsWith('<') ? 'source.vue' : 'source.ts';

    expect(transformationMemberIdentity(source, file))
      .toBe(transformationMemberIdentity(source.replace('./old', './new'), file));
  });

  it.each([
    ['export const value = 1;', 'export const value = 2;'],
    ['const path = "old"; import(path);', 'const path = "new"; import(path);'],
    ['export default "old";', 'export default "new";'],
    ['<template><p>old</p></template>', '<template><p>new</p></template>'],
  ])('preserves non-module content identity in %s', (before, after) => {
    const file = before.startsWith('<') ? 'source.vue' : 'source.ts';

    expect(transformationMemberIdentity(before, file))
      .not.toBe(transformationMemberIdentity(after, file));
  });

  it('normalizes CRLF without accepting malformed syntax', () => {
    expect(transformationMemberIdentity('export const value = 1;\r\n', 'source.ts'))
      .toBe('export const value = 1;\n');

    expect(transformationMemberIdentity('export const = ;', 'source.ts')).toBeNull();
  });

  it('preserves intervening code while rewriting multiple differently sized import paths', () => {
    const original = [
      'import first from \'./a\';',
      'const label = "unchanged";',
      'export { second } from \'./a/very/long/original/module\';',
      'const third = import(\'./third\');',
      'export default first;',
    ].join('\n');

    const moved = original.replace('\'./a\'', '\'./new/long/path\'')
      .replace('./a/very/long/original/module', './b').replace('./third', './moved/third');

    const expected = [
      'import first from \'__module__\';',
      'const label = "unchanged";',
      'export { second } from \'__module__\';',
      'const third = import(\'__module__\');',
      'export default first;',
    ].join('\n');

    expect(transformationMemberIdentity(original, 'source.ts')).toBe(expected);
    expect(transformationMemberIdentity(moved, 'source.ts')).toBe(expected);

    expect(transformationMemberIdentity(moved.replace('unchanged', 'changed'), 'source.ts'))
      .not.toBe(expected);
  });
});
