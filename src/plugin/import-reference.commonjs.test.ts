import { describe, expect, it } from 'vitest';
import { transformationMemberIdentity } from './import-reference';

describe('transformation CommonJS module identity', () => {
  it.each(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue'])(
    'allows a literal require path rewrite in %s', (extension) => {
      const script = 'const service = require(\'../services/foo\');\nmodule.exports = service;';
      const source = extension === 'vue' ? `<script>${script}</script>` : script;
      const moved = source.replace('../services/foo', './services/foo');
      const expected = source.replace('\'../services/foo\'', '\'__module__\'');

      expect(transformationMemberIdentity(source, `source.${extension}`)).toBe(expected);
      expect(transformationMemberIdentity(moved, `source.${extension}`)).toBe(expected);

      expect(transformationMemberIdentity(moved.replace('= service;', '= 42;'),
        `source.${extension}`)).not.toBe(expected);
    },
  );

  it.each([
    'import service = require(\'../services/foo\');\nexport = service;',
    'export import service = require(\'../services/foo\');',
  ])('allows TypeScript external module path rewrites in %s', (source) => {
    const expected = source.replace('\'../services/foo\'', '\'__module__\'');

    expect(transformationMemberIdentity(source, 'source.ts')).toBe(expected);

    expect(transformationMemberIdentity(source.replace('../services/foo', './services/foo'),
      'source.ts')).toBe(expected);
  });

  it.each([
    'function use(require) { return require(\'./old\'); }',
    'const require = (value) => value; require(\'./old\');',
    '{ const require = load; require(\'./old\'); }',
    'const loader = { require }; loader.require(\'./old\');',
    'require.resolve(\'./old\');',
    'load(\'./old\');',
    'new require(\'./old\');',
    'require?.(\'./old\');',
    'require(\'./old\', extra);',
    'require(...[\'./old\']);',
    'const specifier = \'./old\'; require(specifier);',
    'require(`./old`);',
    'const label = \'./old\';',
  ])('preserves non-module or unproven path text in %s', (source) => {
    expect(transformationMemberIdentity(source, 'source.ts')).toBe(source);

    expect(transformationMemberIdentity(source.replace('./old', './new'), 'source.ts'))
      .not.toBe(transformationMemberIdentity(source, 'source.ts'));
  });

  it('resolves require bindings at the call site rather than across unrelated scopes', () => {
    const source = 'function local(require) {}\nconst service = require(\'./old\');';

    expect(transformationMemberIdentity(source, 'source.cjs'))
      .toBe(source.replace('\'./old\'', '\'__module__\''));
  });

  it('preserves both an import-equals binding and an internal namespace reference', () => {
    const source = 'import service = require(\'./old\');\nimport value = Namespace.Member;';
    const expected = source.replace('\'./old\'', '\'__module__\'');

    expect(transformationMemberIdentity(source, 'source.ts')).toBe(expected);

    expect(transformationMemberIdentity(source.replace('= Namespace.Member', '= Namespace.Other'),
      'source.ts')).not.toBe(expected);

    expect(transformationMemberIdentity(source.replace('import service', 'import another'),
      'source.ts')).not.toBe(expected);
  });
});
