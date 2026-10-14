import { describe, expect, it, vi } from 'vitest';
import { prohibitionParserCapabilities } from './prohibition-parser';

describe('parser capability probes', () => {
  it('does not treat a Vue parser name without its parse API as script coverage', () => {
    expect(prohibitionParserCapabilities({ parser: { meta: { name: 'vue-eslint-parser' } } },
      '/missing/Unit.vue')).toEqual({ framework: false, typeReferences: true, syntax: false });
  });

  it('passes the effective syntax options, file path, and parser receiver to the proof', () => {
    const parse = vi.fn(function () {
      return { ast: { body: [{}] } };
    });

    const parser = { meta: { name: 'vue-eslint-parser' }, parseForESLint: parse };

    const options = { parser, ecmaVersion: 2020, sourceType: 'module',
      parserOptions: { parser: 'delegate', ecmaFeatures: { jsx: true }, extra: 'preserved' } };

    expect(prohibitionParserCapabilities(options, '/missing/Unit.vue'))
      .toEqual({ framework: true, typeReferences: true, syntax: true });

    expect(parse).toHaveBeenCalledExactlyOnceWith(
      '<script>var __blueprint_probe__ = 1;</script>',
      { ...options.parserOptions,
        ecmaVersion: 2020,
        sourceType: 'module',
        filePath: '/missing/Unit.vue' },
    );

    expect(parse.mock.contexts).toEqual([parser]);
  });
});

describe('parser capability absence and filename boundaries', () => {
  it.each([undefined, {}, { parserOptions: {} }])('accepts missing options %j', (options) => {
    expect(prohibitionParserCapabilities(options, '/repo/plain.js'))
      .toEqual({ framework: true, typeReferences: true, syntax: true });

    expect(prohibitionParserCapabilities(options, '/repo/View.jsx'))
      .toEqual({ framework: false, typeReferences: true, syntax: false });
  });

  it('uses explicit JSX enablement', () => {
    expect(prohibitionParserCapabilities({ parserOptions: { ecmaFeatures: { jsx: true } } },
      '/repo/View.jsx'))
      .toEqual({ framework: true, typeReferences: true, syntax: true });

    expect(prohibitionParserCapabilities({ parserOptions: { ecmaFeatures: { jsx: false } } },
      '/repo/View.jsx').framework).toBe(false);
  });

  it.each(['/repo/thing.ts.js', '/repo/thing.tsx.js', '/repo/thing.jsx.js'])(
    'uses the final extension of %s', (file) => {
      expect(prohibitionParserCapabilities(undefined, file))
        .toEqual({ framework: true, typeReferences: true, syntax: true });
    });
});
