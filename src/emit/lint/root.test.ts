import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../../config';
import { plugin } from '../../plugin';
import { emitLint } from './lint';
import { sourceRootImportEntries } from './root';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [{ name: 'billing', does: 'billing' }],
    layers: [{ name: 'services', does: 'I/O' }],
    testFiles: ['src/check.ts'],
  },
};

describe('source-root emitted carrier', () => {
  it('leaves layer-first source-root wiring unchanged', () => {
    expect(sourceRootImportEntries({ ...blueprint, architecture: {
      ...blueprint.architecture, modules: undefined,
    } }, 'error', {})).toEqual([]);
  });

  it.each(['warn', 'error'] as const)('retains exact %s severity and policy', (severity) => {
    expect(sourceRootImportEntries(blueprint, severity, {})).toEqual([{
      files: ['src/*.{js,jsx,ts,tsx}'],
      ignores: ['src/check.ts'],
      plugins: { blueprint: plugin },
      rules: { 'blueprint/import-boundary': [severity, { architecture: blueprint.architecture }] },
    }]);
  });

  it('scopes options and runtime resolution to a nested application', () => {
    const basePath = 'apps/web';
    const entries = sourceRootImportEntries(blueprint, 'error', { basePath });

    expect(entries[0].rules).toEqual({ 'blueprint/import-boundary': [
      'error', { architecture: blueprint.architecture, basePath },
    ] });

    const config = [
      { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
      ...emitLint(blueprint, { basePath }),
    ];

    const lint = (filename: string) => new Linter({ configType: 'flat' }).verify(
      'import "~app/billing/Invoice";', config, { filename },
    );

    expect(lint('apps/web/src/main.ts')).toEqual([
      expect.objectContaining({ ruleId: 'blueprint/import-boundary', messageId: 'rootPrivate' }),
    ]);

    expect(lint('src/main.ts')).toEqual([]);
    expect(lint('apps/web/src/check.ts')).toEqual([]);
  });
});
