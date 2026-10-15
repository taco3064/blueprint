import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import * as plugin from '../plugin';
import { runRules } from './rules';

let root: string;

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('rule inventory measures test globs and prohibitions without outside source work', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-source-only-rules-'));

  const files = {
    'package.json': '{"dependencies":{"react":"*"}}',
    'blueprint.config.mjs': 'export default {};',
    'app/auth/domain/value.ts': 'export const value = 1;',
    'app/auth/domain/value.test.ts': 'export const testValue = 1;',
    'tooling/deep/outside.ts': 'export * from "../../app/auth/domain/value";',
    'outside.ts': 'void import(target);',
  };

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  const blueprint: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '@', sourceRoot: 'app',
      modules: [{ name: 'auth', does: 'authentication' }],
      testFiles: ['app/**/*.test.ts'],
      layers: [{ name: 'domain', does: 'policy', mustNot: [{
        id: 'no-ui', description: 'render UI', checks: [{ call: 'divIcon' }],
      }] }],
    },
  };

  const verify = observeSourceWork();
  const output: string[] = [];

  const result = await runRules(root, {
    loadConfig: async () => blueprint,
    json: true,
    log: (line) => { output.push(line); },
  });

  expect(result.prohibitions).toEqual([expect.objectContaining({
    id: 'no-ui', matchedFiles: ['app/auth/domain/value.ts'], reach: 'covered',
  })]);

  expect(JSON.parse(output[0])).not.toHaveProperty('testExemption');

  verify();
});

function observeSourceWork(): () => void {
  const reads = vi.spyOn(fs, 'readFileSync');
  const walks = vi.spyOn(fs, 'readdirSync');
  const imports = vi.spyOn(plugin, 'analyzeDynamicImports');
  const modules = vi.spyOn(plugin, 'analyzeModuleImports');

  return () => {
    const readPaths = reads.mock.calls.map(([file]) => String(file));
    const walkedPaths = walks.mock.calls.map(([directory]) => String(directory));
    const outside = path.join(root, 'tooling');

    expect(readPaths).toContain(path.join(root, 'app/auth/domain/value.test.ts'));
    expect(walkedPaths).toContain(path.join(root, 'app/auth/domain'));
    expect(readPaths).not.toContain(path.join(root, 'outside.ts'));
    expect(readPaths.filter((file) => file.startsWith(outside))).toEqual([]);
    expect(walkedPaths.filter((directory) => directory.startsWith(outside))).toEqual([]);

    for (const parser of [imports, modules]) {
      expect(parser.mock.calls.length).toBeGreaterThan(0);
      expect(parser.mock.calls.every(([, file]) => file?.startsWith('app/'))).toBe(true);
    }
  };
}
