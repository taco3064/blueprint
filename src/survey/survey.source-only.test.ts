import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArchitectureDef } from '../config';
import * as plugin from '../plugin';
import { collectTransformationEvidence } from './candidates';
import { collectModuleToLayerEvidence } from './module-mapping';
import { runSurvey } from './survey';

let root: string;

function write(file: string, text: string): void {
  const absolute = path.join(root, file);

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-source-only-survey-'));
  write('package.json', '{"dependencies":{"react":"*"}}');
  write('tsconfig.json', '{"include":["app/**/*.ts"]}');
  write('app/auth/components/Form.ts', 'export const form = 1;');
  write('app/auth/index.ts', 'export { form } from "./components/Form";');
  write('tooling/deep/outside.ts', 'export * from "../../app/auth";');
  write('outside.ts', 'void import(target);');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const architecture: ArchitectureDef = {
  alias: '@',
  sourceRoot: 'app',
  modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI' }],
};

function observeSourceWork(): () => void {
  const reads = vi.spyOn(fs, 'readFileSync');
  const walks = vi.spyOn(fs, 'readdirSync');
  const imports = vi.spyOn(plugin, 'analyzeDynamicImports');
  const modules = vi.spyOn(plugin, 'analyzeModuleImports');

  return () => {
    const readPaths = reads.mock.calls.map(([file]) => String(file));
    const walkedPaths = walks.mock.calls.map(([directory]) => String(directory));
    const outside = path.join(root, 'tooling');

    expect(readPaths).toContain(path.join(root, 'app/auth/components/Form.ts'));
    expect(walkedPaths).toContain(path.join(root, 'app/auth/components'));
    expect(readPaths).not.toContain(path.join(root, 'outside.ts'));
    expect(readPaths.filter((file) => file.startsWith(outside))).toEqual([]);
    expect(walkedPaths.filter((directory) => directory.startsWith(outside))).toEqual([]);
    expect(imports.mock.calls.length).toBeGreaterThan(0);
    expect(modules.mock.calls.length).toBeGreaterThan(0);

    for (const parser of [imports, modules]) {
      expect(parser.mock.calls.map(([, file]) => file)).toEqual(
        expect.arrayContaining(['app/auth/components/Form.ts', 'app/auth/index.ts']),
      );

      expect(parser.mock.calls.every(([, file]) => file?.startsWith('app/'))).toBe(true);
    }
  };
}

describe('source-only survey consumers', () => {
  it.each(['survey', 'candidate discovery', 'module mapping'] as const)(
    '%s never inventories, reads, or parses outside sourceRoot',
    (consumer) => {
      const survey = runSurvey(root, { sourceRoot: 'app', log: () => {} });
      const verify = observeSourceWork();

      if (consumer === 'survey') {
        expect(runSurvey(root, { sourceRoot: 'app', log: () => {} }).totalFiles).toBe(2);
      } else if (consumer === 'candidate discovery') {
        expect(collectTransformationEvidence(root, survey)).toMatchObject({ scannedFiles: 2 });
      } else {
        expect(collectModuleToLayerEvidence({
          root, survey, architecture, nextAppRouter: false,
        })).toMatchObject({ scannedFiles: 2 });
      }

      verify();
    },
  );
});
