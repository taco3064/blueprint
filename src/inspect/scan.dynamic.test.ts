import { describe, expect, it } from 'vitest';

import {
  extractImportAnalysis,
  importAnalysis,
  importGraphDerivation,
} from './scan';

describe('inspect import analysis · dynamic imports', () => {
  it.each([
    ['JavaScript concat', 'source.js', 'const p = "~app/hooks"; import(p + "/useX")'],
    [
      'TypeScript template',
      'source.ts',
      'const p: string = "~app/hooks"; import(`${p}/useX`)',
    ],
    [
      'Vue script setup',
      'source.vue',
      '<script setup lang="ts">const p = "~app/hooks" as const; import(`${p}/useX`)</script>',
    ],
  ])('extracts a statically known %s target', (_label, filename, source) => {
    expect(extractImportAnalysis(source, filename)).toEqual({
      imports: [{ specifier: '~app/hooks/useX', names: [], isExport: false }],
      analysis: { unknownDynamicImports: 0 },
    });
  });

  it('counts runtime-dependent targets without creating edges', () => {
    expect(extractImportAnalysis(
      'let p = "~app/hooks/useX"; p = runtime; import(p); import(window.route)',
      'source.ts',
    )).toEqual({
      imports: [],
      analysis: { unknownDynamicImports: 2 },
    });
  });

  it('keeps a quoted target visible when another syntax error prevents parsing', () => {
    const result = extractImportAnalysis('import("~app/hooks/useX"); const =', 'broken.ts');

    expect(result.imports).toEqual([
      { specifier: '~app/hooks/useX', names: [], isExport: false },
    ]);

    expect(result.analysis).toMatchObject({
      unknownDynamicImports: 0,
      parseError: expect.any(String),
    });
  });

  it('aggregates exact limitations for reports', () => {
    const scan = {
      topDirs: ['hooks'],
      files: [
        {
          path: 'src/hooks/a.ts',
          segments: ['hooks', 'a.ts'],
          imports: [],
          importAnalysis: { unknownDynamicImports: 2 },
        },
        {
          path: 'src/hooks/b.vue',
          segments: ['hooks', 'b.vue'],
          imports: [],
          importAnalysis: { unknownDynamicImports: 1, parseError: 'broken' },
        },
      ],
    };

    expect(importAnalysis(scan)).toEqual({
      unknownDynamicImports: 3,
      parseFailures: [{ path: 'src/hooks/b.vue', message: 'broken' }],
    });

    const prose = importGraphDerivation('', scan);

    expect(prose).toContain('3 runtime-dependent dynamic import(s)');
    expect(prose).toContain('1 file parse failure(s)');
    expect(prose).toContain('neither');
    expect(prose).toContain('verified legal dependency');
  });
});
