import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint, Tier } from '../config';
import { runInspect } from './inspect';
import { BASELINE_FILE } from './baseline';

let root: string;

function write(file: string, content = 'export {};'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function configuration(tier?: Tier): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'a', does: 'A', dependsOn: ['b'] },
        { name: 'b', does: 'B', dependsOn: ['c'] },
        { name: 'c', does: 'C' },
      ],
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
    },
    rules: tier === undefined ? {} : { moduleDependencySync: tier },
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-gate-'));
  write('package.json', JSON.stringify({ name: 'gate', dependencies: { react: '^19' } }));
  write('blueprint.config.mjs');
  write('src/a/index.ts', 'import "~app/b"; import "~app/c";');
  write('src/b/index.ts', 'import "~app/c";');
  write('src/c/index.ts');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('module dependency gate · opt in', () => {
  it.each([undefined, 'off', 'warn', 'error'] as const)(
    'tier %s preserves transitive permission and uses ordinary exit semantics', async (tier) => {
      const result = await runInspect(root, {
        loadConfig: async () => configuration(tier), log: () => {},
      });

      expect(result.ok).toBe(tier !== 'error');
      expect(result.moduleDependencies?.status).toBe('drift');
      expect(result.findings.filter((finding) => finding.rule === 'flow-violation')).toEqual([]);

      expect(result.findings.filter((finding) => finding.rule === 'module-dependency-missing'))
        .toMatchObject(tier === undefined || tier === 'off'
          ? []
          : [{
              path: 'src/a', subject: 'c', severity: tier,
            }]);
    },
  );
});

describe('module dependency baseline · JSON', () => {
  it('returns the complete model when recording a baseline', async () => {
    const loadConfig = async () => configuration('error');
    const initial = await runInspect(root, { loadConfig, log: () => {} });
    let output = '';

    const recorded = await runInspect(root, {
      loadConfig, updateBaseline: true, json: true, log: (text) => (output = text),
    });

    expect(recorded.ok).toBe(true);
    expect(recorded.moduleDependencies).toEqual(initial.moduleDependencies);

    expect(JSON.parse(output)).toMatchObject({
      ok: true, moduleDependencies: initial.moduleDependencies,
    });

    expect(fs.existsSync(path.join(root, BASELINE_FILE))).toBe(true);
  });

  it('returns importer uncertainty when refusing an incomplete baseline', async () => {
    write('src/a/index.ts', 'const invalid: = 1;');
    let output = '';

    const refused = await runInspect(root, {
      loadConfig: async () => configuration('error'), updateBaseline: true, json: true,
      log: (text) => (output = text),
    });

    expect(refused.ok).toBe(false);
    expect(refused.moduleDependencies?.status).toBe('indeterminate');

    expect(refused.moduleDependencies?.modules[0]).toMatchObject({
      unusedDeclarations: [], unverifiedDeclarations: ['b'],
      uncertainty: [{ cause: 'parse-failure', path: 'src/a/index.ts' }],
    });

    expect(JSON.parse(output)).toMatchObject({
      ok: false, moduleDependencies: refused.moduleDependencies,
    });

    expect(fs.existsSync(path.join(root, BASELINE_FILE))).toBe(false);
  });
});
