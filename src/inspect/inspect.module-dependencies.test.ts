import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { runInspect } from './inspect';
import { runDeps } from './deps';
import { BASELINE_FILE, renderBaseline } from './baseline';
import * as outside from './outside-scope';

let root: string;

const silent = () => {};

function write(file: string, content = 'export {};'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function configuration(direct = false): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'a', does: 'A', dependsOn: direct ? ['b', 'c'] : ['b'] },
        { name: 'b', does: 'B', dependsOn: ['c'] },
        { name: 'c', does: 'C' },
        { name: 'unrelated', does: 'Unrelated' },
      ],
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
    },
    rules: { moduleDependencySync: 'error' },
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-integration-'));
  write('package.json', JSON.stringify({ name: 'integration', dependencies: { react: '^19' } }));
  write('blueprint.config.mjs');
  write('src/a/index.ts', 'import "~app/b"; import "~app/c/private.ts";');
  write('src/b/index.ts', 'import "~app/c";');
  write('src/c/index.ts');
  write('src/c/private.ts');
  write('src/unrelated/index.ts');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

async function assertHumanReports(loadConfig: () => Promise<Blueprint>, status: string) {
  for (const run of [runInspect, runDeps]) {
    let human = '';

    await run(root, { loadConfig, log: (output) => (human = output) });
    expect(human).toContain('~app/c/private.ts');
    expect(human).toContain(status);
  }
}

function assertPrivateRoot(
  inspected: Awaited<ReturnType<typeof runInspect>>, direct: boolean,
): void {
  const model = inspected.moduleDependencies!;
  const importer = model.modules.find((module) => module.name === 'a')!;

  expect(model.status).toBe(direct ? 'synchronized' : 'drift');

  expect(importer.observedDirect).toContainEqual({
    from: 'a', to: 'c', references: 1,
    permission: direct ? 'direct' : 'transitive',
    evidence: [{ path: 'src/a/index.ts', specifier: '~app/c/private.ts' }],
  });

  expect(importer.missingDeclarations).toEqual(direct ? [] : ['c']);
  expect(importer.matched).toEqual(direct ? ['b', 'c'] : ['b']);

  expect(inspected.findings.filter((finding) => finding.rule === 'deep-import'))
    .toMatchObject([{ path: 'src/a/index.ts', subject: '~app/c/private.ts' }]);

  expect(inspected.findings.filter((finding) => finding.rule === 'module-dependency-missing'))
    .toMatchObject(direct ? [] : [{ path: 'src/a', subject: 'c', severity: 'error' }]);
}

describe('module dependency synchronization · root entry boundary', () => {
  it.each([false, true])('retains private-root evidence for direct=%s', async (direct) => {
    const loadConfig = async () => configuration(direct);
    let inspectJson = '';
    let depsJson = '';

    const inspected = await runInspect(root, {
      loadConfig, json: true, log: (output) => (inspectJson = output),
    });

    const dependencies = await runDeps(root, {
      loadConfig, json: true, log: (output) => (depsJson = output),
    });

    const model = inspected.moduleDependencies!;

    assertPrivateRoot(inspected, direct);

    expect(dependencies.moduleDependencies).toEqual(model);
    expect(JSON.parse(depsJson).moduleDependencies).toEqual(model);
    expect(JSON.parse(inspectJson).moduleDependencies).toEqual(model);
    expect(model.modules.find((module) => module.name === 'unrelated')?.observedDirect).toEqual([]);

    await assertHumanReports(loadConfig, model.status);
  });

  it('counts a legal bare entry without a deep-import violation', async () => {
    write('src/a/index.ts', 'import "~app/b"; import "~app/c";');

    const result = await runInspect(root, {
      loadConfig: async () => configuration(true), log: silent,
    });

    expect(result.moduleDependencies!.status).toBe('synchronized');
    expect(result.findings.filter((finding) => finding.rule === 'deep-import')).toEqual([]);

    expect(result.moduleDependencies!.modules[0].observedDirect.map((edge) => edge.to))
      .toEqual(['b', 'c']);
  });

  it('does not fabricate a module edge for an unresolved private target', async () => {
    write('src/a/index.ts', 'import "~app/b"; import "~app/c/missing.ts";');

    const result = await runInspect(root, {
      loadConfig: async () => configuration(true), log: silent,
    });

    const importer = result.moduleDependencies!.modules[0];

    expect(importer.observedDirect.map((edge) => edge.to)).toEqual(['b']);
    expect(importer.unverifiedDeclarations).toEqual(['c']);
    expect(importer.unusedDeclarations).toEqual([]);
    expect(importer.uncertainty).toHaveLength(1);
    expect(result.moduleDependencies!.status).toBe('indeterminate');
  });
});

describe('module dependency synchronization · baseline', () => {
  it('suppresses findings without suppressing drift facts in any output', async () => {
    const loadConfig = async () => configuration();
    const initial = await runInspect(root, { loadConfig, log: silent });

    expect(initial).toMatchObject({ ok: false, moduleDependencies: { status: 'drift' } });
    const locked = await runInspect(root, { loadConfig, updateBaseline: true, log: silent });

    expect(locked.ok).toBe(true);
    expect(locked.moduleDependencies).toEqual(initial.moduleDependencies);
    let output = '';

    const ratcheted = await runInspect(root, {
      loadConfig, baseline: true, json: true, log: (text) => (output = text),
    });

    expect(ratcheted.ok).toBe(true);
    expect(ratcheted.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(ratcheted.moduleDependencies).toEqual(initial.moduleDependencies);
    expect(JSON.parse(output).moduleDependencies).toEqual(initial.moduleDependencies);
    expect(JSON.parse(output).suppressed).toBeGreaterThan(0);
    await runInspect(root, { loadConfig, baseline: true, log: (text) => (output = text) });
    expect(output).toMatch(/drift[\s\S]*~app\/c\/private\.ts/);
  });

  it('retains importer uncertainty when an existing baseline suppresses its finding', async () => {
    write('src/a/index.ts', 'import "~app/b"; import(process.env.TARGET);');
    const loadConfig = async () => configuration(true);
    const initial = await runInspect(root, { loadConfig, log: silent });

    fs.writeFileSync(path.join(root, BASELINE_FILE), renderBaseline(initial.findings));
    let output = '';

    const ratcheted = await runInspect(root, {
      loadConfig, baseline: true, json: true, log: (text) => (output = text),
    });

    expect(initial.moduleDependencies!.status).toBe('indeterminate');
    expect(initial.moduleDependencies!.modules[0].unverifiedDeclarations).toEqual(['c']);
    expect(ratcheted.moduleDependencies).toEqual(initial.moduleDependencies);
    expect(JSON.parse(output).moduleDependencies).toEqual(initial.moduleDependencies);

    expect(ratcheted.findings.filter((finding) => finding.rule === 'module-dependency-unverified'))
      .toEqual([]);
  });
});

describe('module dependency synchronization · outside consumers', () => {
  it.each([false, true])('retains governed identity with broad consumerFiles=%s', async (broad) => {
    write('src/a/index.ts', 'import "~app/b"; import "~app/c";');
    write('tools/consumer.ts', 'import "~app/a";');
    const blueprint = configuration(true);

    blueprint.architecture.consumerFiles = broad ? '**/*' : 'tools/**';
    const loadConfig = async () => blueprint;
    const inspected = await runInspect(root, { loadConfig, log: silent });
    const dependencies = await runDeps(root, { loadConfig, log: silent });

    expect(inspected.moduleDependencies!.status).toBe('synchronized');
    expect(inspected.moduleDependencies).toEqual(dependencies.moduleDependencies);

    expect(inspected.moduleDependencies!.modules.map((module) => module.name))
      .toEqual(['a', 'b', 'c', 'unrelated']);

    expect(inspected.moduleDependencies!.modules[0].observedDirect.map((edge) => edge.to))
      .toEqual(['b', 'c']);

    expect(inspected.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
      .toEqual([]);
  });

  it('excludes known consumers from uncertainty and reports reverse use', async () => {
    write('src/a/index.ts', 'import "~app/b"; import "~app/c"; import "../../tools/consumer";');
    write('tools/consumer.ts', 'export const tool = 1;');
    const blueprint = configuration(true);

    blueprint.architecture.consumerFiles = 'tools/**';
    const result = await runInspect(root, { loadConfig: async () => blueprint, log: silent });

    expect(result.moduleDependencies!.status).toBe('synchronized');
    expect(result.moduleDependencies!.modules[0].uncertainty).toEqual([]);

    expect(result.moduleDependencies!.modules[0].observedDirect.map((edge) => edge.to))
      .toEqual(['b', 'c']);

    expect(result.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
      .toMatchObject([{ subject: 'tools' }]);
  });

  it.each(['partial', 'unavailable'] as const)(
    'does not conflate %s outside evidence with complete module facts', async (status) => {
      write('src/a/index.ts', 'import "~app/b"; import "~app/c";');

      if (status === 'partial') {
        write('tools/broken.ts', 'const invalid: = 1;');
      } else {
        vi.spyOn(outside, 'collectOutsideScope').mockReturnValue({
          status: 'unavailable', inventoryMode: 'none', reason: 'inventory unavailable',
        });
      }

      let output = '';

      const result = await runInspect(root, {
        loadConfig: async () => configuration(true), json: true, log: (text) => (output = text),
      });

      expect(result.ok).toBe(false);
      expect(result.moduleDependencies!.status).toBe('synchronized');

      expect(result.moduleDependencies!.modules.every((module) => module.uncertainty.length === 0))
        .toBe(true);

      expect(JSON.parse(output).outsideScope.status).toBe(status);
      expect(JSON.parse(output).moduleDependencies).toEqual(result.moduleDependencies);
    },
  );
});
