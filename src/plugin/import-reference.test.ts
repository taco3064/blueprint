import { describe, expect, it } from 'vitest';

import { analyzeDynamicImports } from './import-reference';

describe('analyzeDynamicImports', () => {
  it.each([
    ['literal', 'import("~app/hooks/useCart")', '~app/hooks/useCart'],
    ['plain template', 'import(`~app/hooks/useCart`)', '~app/hooks/useCart'],
    [
      'immutable concatenation',
      'const root = "~app/"; const layer = "hooks"; import(root + layer + "/useCart")',
      '~app/hooks/useCart',
    ],
    [
      'immutable template substitution',
      'const layer = "hooks"; import(`~app/${layer}/useCart`)',
      '~app/hooks/useCart',
    ],
  ])('resolves a JavaScript %s', (_label, source, expected) => {
    expect(analyzeDynamicImports(source)).toEqual({ specifiers: [expected], unknown: 0 });
  });

  it('resolves TypeScript values without treating annotations as runtime proof', () => {
    const result = analyzeDynamicImports(
      'const root: string = "~app"; const layer = "hooks" as const; import(`${root}/${layer}/x`)',
      'source.ts',
    );

    expect(result).toEqual({ specifiers: ['~app/hooks/x'], unknown: 0 });
  });

  it.each([
    [
      'JSX',
      'Component.jsx',
      'const View = ({ value }) => <div>{value}</div>; import("~app/hooks/useView")',
    ],
    [
      'TSX',
      'Component.tsx',
      'const View = (value: string) => <div>{value}</div>; import("~app/hooks/useView")',
    ],
  ])('resolves a dynamic import beside actual %s syntax', (_label, filePath, source) => {
    expect(analyzeDynamicImports(source, filePath))
      .toEqual({ specifiers: ['~app/hooks/useView'], unknown: 0 });
  });

  it.each([
    ['ordinary script', '<script lang="ts">const p = "~app/hooks"; import(`${p}/x`)</script>'],
    ['script setup', '<script setup lang="ts">const p = "~app/hooks"; import(p + "/x")</script>'],
    [
      'typed script setup',
      '<script setup lang="ts">const p: string = "~app/hooks"; import(p + "/x")</script>',
    ],
  ])('resolves Vue %s imports', (_label, source) => {
    expect(analyzeDynamicImports(source, 'Component.vue'))
      .toEqual({ specifiers: ['~app/hooks/x'], unknown: 0 });
  });

  it.each([
    ['reassigned binding', 'let p = "~app/hooks/x"; p = runtime; import(p)'],
    ['shadowed parameter', 'const p = "~app/hooks/x"; function load(p) { return import(p) }'],
    ['runtime substitution', 'import(`~app/hooks/${window.name}`)'],
    ['non-string constant', 'import(42)'],
  ])('leaves a %s unknown', (_label, source) => {
    expect(analyzeDynamicImports(source)).toEqual({ specifiers: [], unknown: 1 });
  });

  it('reports parse failures without manufacturing a target', () => {
    expect(analyzeDynamicImports('const =', 'broken.ts')).toMatchObject({
      specifiers: [],
      unknown: 0,
      parseError: expect.any(String),
    });
  });

  it('walks nullable items in parser visitor arrays safely', () => {
    expect(analyzeDynamicImports('const [first,,last] = values; import("~app/hooks/x")'))
      .toEqual({ specifiers: ['~app/hooks/x'], unknown: 0 });
  });
});
