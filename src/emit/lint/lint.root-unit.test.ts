import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import vueParser from 'vue-eslint-parser';
import type { Blueprint } from '../../config';
import { emitLint } from './lint';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    additionalAliases: { '~billing': 'src/billing' },
    modules: [
      { name: 'account', does: 'account', dependsOn: ['billing'] },
      { name: 'billing', does: 'billing' },
      { name: 'isolated', does: 'isolated' },
      { name: 'app', does: 'routing', dependsOn: ['account'] },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'services', does: 'IO', layout: 'folder' },
    ],
  },
};

function lint(code: string, filename = 'src/account/index.ts', configured = blueprint) {
  const messages = new Linter({ configType: 'flat' }).verify(code, [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser } },
    { files: ['**/*.vue'], languageOptions: {
      parser: vueParser, parserOptions: { parser: tsParser },
    } },
    ...emitLint(configured),
  ], { filename });

  expect(messages.filter((message) => message.fatal)).toEqual([]);

  return messages;
}

const forms = [
  (target: string) => `import value from '${target}';`,
  (target: string) => `export { value } from '${target}';`,
  (target: string) => `export * from '${target}';`,
  (target: string) => `const value = require('${target}');`,
  (target: string) => `import value = require('${target}');`,
  (target: string) => `type Value = typeof import('${target}');`,
  (target: string) => `import('${target}');`,
  (target: string) => `const target = '${target}'; import(target);`,
  (target: string) => `const prefix = '${target.slice(0, -1)}'; import(prefix + '${target.slice(-1)}');`,
];

describe('emitted ordinary root-unit boundary', () => {
  it.each(forms)('applies root privacy across supported syntax %#', (code) => {
    for (const target of ['~app/billing/index', '~app/billing/index.ts', '~app/billing/Invoice']) {
      expect(lint(code(target))).toEqual([expect.objectContaining({
        ruleId: 'blueprint/import-boundary', messageId: 'rootPrivate',
        message: `🚫 "${target}" reaches inside a root unit. Import "~app/billing" instead.`,
      })]);
    }

    expect(lint(code('~app/billing'))).toEqual([]);
    expect(lint(code('./Invoice'))).toEqual([]);
    expect(lint(code('react'))).toEqual([]);
    expect(lint(code('~app/billing/services/api'))).toEqual([]);
  });

  it.each(forms)('preserves same-root relative and canonical layer crossings %#', (code) => {
    expect(lint(code('~app/account/Invoice'))).toEqual([
      expect.objectContaining({ messageId: 'rootAlias' }),
    ]);

    expect(lint(code('./services/api')).map((message) => message.ruleId))
      .toContain('blueprint/relative-escape');
  });

  it('rejects root privacy from source-root wiring, including relative imports', () => {
    for (const target of ['~app/billing/Invoice', './billing/Invoice', '~app/billing/index']) {
      expect(lint(`import '${target}';`, 'src/main.ts')).toEqual([
        expect.objectContaining({ messageId: 'rootPrivate' }),
      ]);
    }

    expect(lint('import "~app/billing";', 'src/main.ts')).toEqual([]);

    expect(lint('import "./billing";', 'src/main.ts')).toEqual([
      expect.objectContaining({ messageId: 'rootCanonical' }),
    ]);

    expect(lint('import "~billing";', 'src/main.ts')).toEqual([
      expect.objectContaining({ messageId: 'canonical' }),
    ]);
  });

  it('preserves forbidden module and upward container dependencies', () => {
    expect(lint('import "~app/isolated";').map((message) => message.messageId))
      .toContain('flow');

    expect(lint('import "~app/account";', 'src/account/services/api/index.ts')
      .map((message) => message.messageId)).toContain('flow');

    const privateTarget = lint('import "~app/account/Invoice";',
      'src/account/services/api/index.ts');

    expect(privateTarget.find((message) => message.messageId === 'rootPrivate')?.message)
      .toBe('🚫 "~app/account/Invoice" reaches inside a root unit.');
  });

  it('does not classify recursive app routes as ordinary private members', () => {
    expect(lint('import "./nested/page";', 'src/app/index.ts')).toEqual([]);
    expect(lint('import "../layout";', 'src/app/nested/page.ts')).toEqual([]);
  });

  it.each([
    'function load(require) { return require("~app/billing/Invoice"); }',
    'const require = loader; require("~app/billing/Invoice");',
    'require.resolve("~app/billing/Invoice");',
    'require?.("~app/billing/Invoice");',
    'require("~app/billing/Invoice", extra);',
    'import(target);',
    'let target = "~app/billing/Invoice"; target = runtime; import(target);',
    'export const value = 1;',
  ])('does not invent module edges for %s', (code) => {
    expect(lint(code)).toEqual([]);
  });

  it('applies the carrier to Vue script imports and sourceRoot dot', () => {
    expect(lint('<script setup>import "~app/billing/Invoice";</script>',
      'src/account/index.vue', { ...blueprint, framework: 'vue' })).toEqual([
      expect.objectContaining({ messageId: 'rootPrivate' }),
    ]);

    expect(lint('import "~app/billing/Invoice";', 'main.ts', {
      ...blueprint, architecture: { ...blueprint.architecture, sourceRoot: '.' },
    })).toEqual([expect.objectContaining({ messageId: 'rootPrivate' })]);
  });

  it('preserves test and explicit file exemptions', () => {
    const configured = { ...blueprint, architecture: {
      ...blueprint.architecture, layerFilesIgnore: ['src/account/held.ts'],
    } };

    expect(lint('import "~app/billing/Invoice";', 'src/account/private.test.ts'))
      .toEqual([]);

    expect(lint('import "~app/billing/Invoice";', 'src/account/held.ts', configured)
      .filter((message) => message.ruleId !== null)).toEqual([]);
  });
});
