import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { runDeps } from './deps';
import { runInspect } from './inspect';
import * as facts from './facts';
import * as scanner from './scan';
import * as filtering from './filter';
import * as outside from './outside-scope';

let root: string;

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'a', does: 'A', dependsOn: ['b'] },
      { name: 'b', does: 'B' },
      { name: 'c', does: 'C', dependsOn: ['b'] },
    ],
    layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
  },
};

const loadConfig = async () => blueprint;

const silent = () => {};

function write(file: string, content = 'export {};'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-module-'));
  write('package.json', JSON.stringify({ name: 'dependency-fixture' }));
  write('blueprint.config.mjs');
  write('src/a/index.ts', 'import "~app/b";');
  write('src/b/index.ts');
  write('src/c/index.ts');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('deps module facts · target scope', () => {
  it.each(['a', 'src/a/index.ts'])('retains repository drift for target %s', async (target) => {
    let output = '';
    const complete = await runDeps(root, { loadConfig, log: silent });

    const targeted = await runDeps(root, {
      loadConfig, target, json: true, log: (text) => (output = text),
    });

    expect(complete.moduleDependencies!.status).toBe('drift');
    expect(complete.targetModule).toBeNull();
    expect(targeted.targetModule).toBe('a');
    expect(targeted.moduleDependencies).toEqual(complete.moduleDependencies);
    expect(targeted.moduleDependencies!.modules[0].unusedDeclarations).toEqual([]);
    expect(targeted.moduleDependencies!.modules[2].unusedDeclarations).toEqual(['b']);
    expect(JSON.parse(output).targetModule).toBe('a');
    expect(JSON.parse(output).moduleDependencies).toEqual(complete.moduleDependencies);
    await runDeps(root, { loadConfig, target, log: (text) => (output = text) });
    expect(output).toContain('drift');
    expect(output).toContain('a');
  });

  it('retains repository facts when the requested unit is unknown', async () => {
    const complete = await runDeps(root, { loadConfig, log: silent });
    let output = '';

    const unknown = await runDeps(root, {
      loadConfig, target: 'missing', json: true, log: (text) => (output = text),
    });

    expect(unknown.ok).toBe(false);
    expect(unknown.units).toEqual([]);
    expect(unknown.targetModule).toBeNull();
    expect(unknown.moduleDependencies).toEqual(complete.moduleDependencies);

    expect(JSON.parse(output)).toMatchObject({
      ok: false, units: [], targetModule: null, moduleDependencies: complete.moduleDependencies,
    });

    await runDeps(root, { loadConfig, target: 'missing', log: (text) => (output = text) });
    expect(output).toContain('drift');
    expect(output).toContain('Unknown unit');
  });
});

describe('module facts · shared collection ownership', () => {
  it.each(['deps', 'inspect'] as const)('%s retains shared collection', async (command) => {
    write('src/a/example.test.ts', 'import "~app/c";');
    write('tools/broken.ts', 'const invalid: = 1;');
    const { collect, scan, outsideScan, filter, read } = instrumentation();

    const result = command === 'deps'
      ? await runDeps(root, { loadConfig, log: silent })
      : await runInspect(root, { loadConfig, log: silent });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledExactlyOnceWith(root, 'src');
    expect(filter).toHaveBeenCalledTimes(command === 'deps' ? 1 : 2);
    expect(outsideScan).toHaveBeenCalledTimes(command === 'deps' ? 0 : 1);
    const collected = collect.mock.results[0].value;

    expect(result.moduleDependencies).toBe(collected.moduleDependencies);

    expect(result.moduleDependencies!.modules[0]).toMatchObject({
      observedDirect: [{ to: 'b' }], missingDeclarations: [],
    });

    expect(collected.scanResult.governedWork)
      .toEqual({ inventoryFiles: 4, readFiles: 4, parsedFiles: 4 });

    assertReadCounts(read, command);
  });
});

function assertReadCounts(read: ReturnType<typeof instrumentation>['read'], command: string): void {
  for (const file of ['a/index.ts', 'a/example.test.ts', 'b/index.ts', 'c/index.ts']) {
    const reads = read.mock.calls.filter(([readPath]) =>
      String(readPath) === path.join(root, 'src', file));

    expect(reads).toHaveLength(1);
  }

  if (command === 'deps') {
    expect(read.mock.calls.map(([file]) => String(file)))
      .not.toContain(path.join(root, 'tools/broken.ts'));
  }
}

function instrumentation() {
  return {
    collect: vi.spyOn(facts, 'collectArchitectureFacts'),
    scan: vi.spyOn(scanner, 'scan'),
    outsideScan: vi.spyOn(outside, 'collectOutsideScope'),
    filter: vi.spyOn(filtering, 'dropTestFiles'),
    read: vi.spyOn(fs, 'readFileSync'),
  };
}
