import path from 'node:path';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import type { LintConfigEntry } from '../emit/lint';
import { wiringCheck } from './wiring';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'account', does: 'accounts', dependsOn: ['billing'] },
      { name: 'billing', does: 'billing' },
    ],
    layers: [{ name: 'services', does: 'I/O' }],
  },
};

const root = process.cwd();

function eslint(override: LintConfigEntry[] = []) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
      ...emitLint(blueprint),
      ...override,
    ],
  });
}

async function check(override: LintConfigEntry[] = []) {
  return wiringCheck({
    root,
    blueprint,
    scanResult: { topDirs: ['account', 'billing'], files: [
      { path: 'src/main.ts', segments: ['main.ts'], imports: [] },
      { path: 'src/account/index.ts', segments: ['account', 'index.ts'], imports: [] },
      { path: 'src/billing/index.ts', segments: ['billing', 'index.ts'], imports: [] },
    ] },
    wired: true,
    merged: true,
    hasTypescript: true,
    load: async () => ({ ESLint: class {
      calculateConfigForFile(file: string) {
        return eslint(override).calculateConfigForFile(file);
      }
    } }),
  });
}

describe('Doctor root-unit carrier evidence through real ESLint', () => {
  it('accepts intact enforcement and proves actual public/private behavior', async () => {
    expect((await check()).check.ok).toBe(true);

    for (const file of ['src/main.ts', 'src/account/index.ts']) {
      const bad = await eslint().lintText('import "~app/billing/Invoice";', {
        filePath: path.join(root, file),
      });

      expect(bad[0].messages).toEqual([
        expect.objectContaining({ ruleId: 'blueprint/import-boundary', messageId: 'rootPrivate' }),
      ]);

      const good = await eslint().lintText('import "~app/billing";', {
        filePath: path.join(root, file),
      });

      expect(good[0].messages).toEqual([]);
    }
  });

  it.each(['src/main.ts', 'src/account/index.ts'])(
    'detects the root carrier switched off at %s', async (file) => {
      const override: LintConfigEntry[] = [{
        files: [file], rules: { 'blueprint/import-boundary': 'off' },
      }];

      const result = await check(override);

      expect(result.check.ok).toBe(false);
      expect(result.check.detail).toContain('blueprint/import-boundary is missing, off');

      const bad = await eslint(override).lintText('import "~app/billing/Invoice";', {
        filePath: path.join(root, file),
      });

      expect(bad[0].messages).toEqual([]);
    },
  );

  it('detects removal of ordinary roots from the effective architecture policy', async () => {
    const override: LintConfigEntry[] = [{
      files: ['src/**/*.ts'], rules: { 'blueprint/import-boundary': ['error', {
        architecture: { ...blueprint.architecture, modules: undefined },
      }] },
    }];

    expect((await check(override)).check.ok).toBe(false);

    const bad = await eslint(override).lintText('import "~app/billing/Invoice";', {
      filePath: path.join(root, 'src/account/index.ts'),
    });

    expect(bad[0].messages).toEqual([]);
  });
});
