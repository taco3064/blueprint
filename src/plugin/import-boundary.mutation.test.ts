import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { importBoundary } from './import-boundary';

function architecture(): ArchitectureDef {
  return {
    alias: '~app',
    sourceRoot: 'src',
    additionalAliases: {
      '~root': '.',
      '~authHooks': 'src/auth/hooks',
    },
    modules: [
      { name: 'auth', does: 'auth' },
      { name: 'history', does: 'history', dependsOn: ['auth'] },
      { name: 'profile', does: 'profile' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'hooks', does: 'state', layout: 'folder' },
      { name: 'services', does: 'I/O', layout: 'folder' },
    ],
  };
}

function messages(
  code: string,
  filename: string,
  configured: ArchitectureDef = architecture(),
): Linter.LintMessage[] {
  return new Linter({ configType: 'flat' }).verify(code, [{
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    plugins: { blueprint: { rules: { 'import-boundary': importBoundary } } },
    rules: {
      'blueprint/import-boundary': ['error', { architecture: configured }],
    },
  }], { filename });
}

function dynamic(specifier: string, filename: string): Linter.LintMessage[] {
  return messages(`import(${JSON.stringify(specifier)});`, filename);
}

describe('import-boundary context guards', () => {
  it('stays inert for an unclassified source folder', () => {
    expect(dynamic('~root/src/auth/hooks/useAuth', 'src/unknown/file.js')).toEqual([]);
  });

  it('stays inert for source-root wiring and ordinary external imports', () => {
    expect(dynamic('~root/src/auth/hooks/useAuth', 'src/index.js')).toEqual([]);
    expect(dynamic('react', 'src/auth/hooks/useAuth.js')).toEqual([]);
  });
});

describe('import-boundary canonical evidence', () => {
  it('reports the secondary spelling and canonical replacement exactly', () => {
    expect(messages(
      'import value from "~root/src/auth/hooks/useAuth";',
      'src/history/components/Card/index.js',
    )).toEqual([expect.objectContaining({
      ruleId: 'blueprint/import-boundary',
      messageId: 'canonical',
      message: expect.stringContaining(
        '"~root/src/auth/hooks/useAuth" crosses an architectural boundary',
      ),
    })]);

    expect(messages(
      'export { value } from "~root/src/auth/hooks/useAuth";',
      'src/history/components/Card/index.js',
    )[0].message).toContain('"~app/auth/hooks/useAuth"');

    expect(messages(
      'export * from "~root/src/auth/hooks/useAuth";',
      'src/history/components/Card/index.js',
    )[0].messageId).toBe('canonical');
  });

  it('does not canonicalize a secondary alias inside its own layer', () => {
    expect(messages(
      'import value from "~authHooks/useOther";',
      'src/auth/hooks/useAuth.js',
    )).toEqual([]);
  });
});

describe('import-boundary dynamic evidence', () => {
  it('reports same-layer and deep-folder data without dropping the specifier', () => {
    expect(dynamic(
      '~app/auth/hooks/useOther',
      'src/auth/hooks/useAuth/index.js',
    )).toEqual([expect.objectContaining({
      messageId: 'sameLayer',
      message: expect.stringContaining('~app/auth/hooks/useOther'),
    })]);

    expect(dynamic(
      '~app/auth/hooks/useOther/internal',
      'src/history/components/Card/index.js',
    )).toEqual([expect.objectContaining({
      messageId: 'deepImport',
      message: expect.stringContaining('~app/auth/hooks/useOther/internal'),
    })]);
  });

  it('allows a folder entry but rejects only descendants beyond it', () => {
    expect(dynamic(
      '~app/auth/hooks/useOther',
      'src/history/components/Card/index.js',
    )).toEqual([]);

    expect(dynamic(
      '~app/auth/hooks/useOther/internal',
      'src/history/components/Card/index.js',
    )[0].messageId).toBe('deepImport');
  });

  it('does not report same-layer for different layers in the same module', () => {
    expect(dynamic(
      '~app/auth/hooks/useAuth',
      'src/auth/components/Card/index.js',
    )).toEqual([]);
  });

  it('leaves unresolved alias-like targets alone', () => {
    expect(dynamic('~unknown/value', 'src/auth/hooks/useAuth.js')).toEqual([]);
  });

  it('does not apply folder-depth rules to file-layout layers', () => {
    const configured = architecture();

    configured.layers = configured.layers.map((layer) => layer.name === 'hooks'
      ? { ...layer, layout: 'file' }
      : layer);

    expect(messages(
      'import("~app/auth/hooks/useOther/internal");',
      'src/history/components/Card/index.js',
      configured,
    )).toEqual([]);
  });

  it.each([
    [
      'module only',
      {
        specifier: '~app/profile/services/api',
        filename: 'src/auth/hooks/useAuth.js',
        reason: 'the module dependency graph',
      },
    ],
    [
      'inner only',
      {
        specifier: '~app/auth/components/Card',
        filename: 'src/history/hooks/useHistory.js',
        reason: 'the inner dependency flow',
      },
    ],
    [
      'both',
      {
        specifier: '~app/profile/components/Card',
        filename: 'src/auth/services/api.js',
        reason: 'the module dependency graph and the inner dependency flow',
      },
    ],
  ])('reports the complete %s reason', (_label, evidence) => {
    const flow = dynamic(evidence.specifier, evidence.filename)
      .find((message) => message.messageId === 'flow');

    expect(flow).toEqual(expect.objectContaining({
      ruleId: 'blueprint/import-boundary',
      message: `🚫 "${evidence.specifier}" violates ${evidence.reason}.`,
    }));
  });

  it('ignores runtime-dependent and relative dynamic imports', () => {
    expect(messages('import(target);', 'src/auth/hooks/useAuth.js')).toEqual([]);
    expect(dynamic('../components/Card', 'src/auth/hooks/useAuth.js')).toEqual([]);
  });
});
