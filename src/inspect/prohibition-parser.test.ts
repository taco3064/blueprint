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
