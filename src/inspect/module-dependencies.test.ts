import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { collectArchitectureFacts } from './facts';

let root: string;
let blueprint: Blueprint;

function write(file: string, source = 'export {};'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function result() {
  return collectArchitectureFacts(root, blueprint,
    { demand: 'governed-source' }).moduleDependencies;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-module-sync-'));

  blueprint = {
    framework: 'react',
    architecture: {
      alias: '@', modules: [
        { name: 'a', does: 'A', dependsOn: ['b'] },
        { name: 'b', does: 'B', dependsOn: ['c'] },
        { name: 'c', does: 'C' },
      ],
      layers: [{ name: 'services', does: 'services', layout: 'file' }],
    },
  };

  write('src/b/services/B.ts');
  write('src/c/services/C.ts');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('separates direct declaration, transitive permission, and observed direct coupling', () => {
  write('src/a/services/A.ts', 'import \'@/c/services/C\';');
  const facts = result()!;

  expect(facts.status).toBe('drift');

  expect(facts.modules[0]).toEqual({
    name: 'a', root: 'src/a', declaredDirect: ['b'], reachable: ['b', 'c'],
    observedDirect: [{ from: 'a', to: 'c', references: 1, permission: 'transitive',
      evidence: [{ path: 'src/a/services/A.ts', specifier: '@/c/services/C' }] }],
    matched: [], missingDeclarations: ['c'], unusedDeclarations: ['b'],
    unverifiedDeclarations: [], uncertainty: [], reach: 'covered',
  });
});

it('retains direct declarations and sorted unique evidence', () => {
  blueprint.architecture.modules![0].dependsOn = ['c', 'b'];
  write('src/a/services/Z.ts', 'import \'@/b/services/B\'; import \'@/b/services/B\';');

  write('src/a/services/A.ts',
    'export * from \'../../b/services/B\'; import \'@/b/services/B\'; import \'@/c/services/C\';');

  write('src/b/services/B.ts', 'import \'@/c/services/C\';');
  const facts = result()!;

  expect(facts.status).toBe('synchronized');

  expect(facts.modules[0]).toMatchObject({ declaredDirect: ['c', 'b'], matched: ['b', 'c'],
    missingDeclarations: [], unusedDeclarations: [], unverifiedDeclarations: [] });

  expect(facts.modules[0].observedDirect).toEqual([
    { from: 'a', to: 'b', references: 4, permission: 'direct', evidence: [
      { path: 'src/a/services/A.ts', specifier: '../../b/services/B' },
      { path: 'src/a/services/A.ts', specifier: '@/b/services/B' },
      { path: 'src/a/services/Z.ts', specifier: '@/b/services/B' },
    ] },
    { from: 'a', to: 'c', references: 1, permission: 'direct',
      evidence: [{ path: 'src/a/services/A.ts', specifier: '@/c/services/C' }] },
  ]);
});

it('keeps forbidden references and independent existing flow violations', () => {
  write('src/c/services/C.ts', 'import \'@/a/services/A\';');
  write('src/a/services/A.ts');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  expect(facts.moduleDependencies!.modules[2].observedDirect[0].permission).toBe('forbidden');
  expect(facts.moduleDependencies!.modules[2].missingDeclarations).toEqual(['a']);
  expect(facts.findings.some((finding) => finding.rule === 'flow-violation')).toBe(true);
});

it('excludes same-module, wiring, external packages and outside importers', () => {
  blueprint.architecture.modules!.forEach((module) => {
    module.dependsOn = [];
  });

  write('src/a/services/A.ts', 'import \'./Local\'; import \'react\';');
  write('src/a/services/Local.ts');
  write('src/main.ts', 'import \'@/b/services/B\'; import(process.env.TARGET);');
  write('outside/Consumer.ts', 'import \'@/b/services/B\';');

  expect(result()).toMatchObject({ status: 'synchronized', modules: [
    { observedDirect: [], uncertainty: [] }, { observedDirect: [] }, { observedDirect: [] },
  ] });
});

it('records importer uncertainty without hiding proven drift or contaminating other modules',
  () => {
    write('src/a/services/A.ts',
      ['import(process.env.TARGET);',
        'import \'@/c/services/C\'; import \'@/missing/X\'; import \'@/missing/X\';'].join(' '));

    write('src/b/services/B.ts', 'import \'@/c/services/C\';');
    const facts = result()!;

    expect(facts.status).toBe('drift');

    expect(facts.modules[0]).toMatchObject({ unusedDeclarations: [], unverifiedDeclarations: ['b'],
      missingDeclarations: ['c'], uncertainty: [
        { cause: 'runtime-dependent-import', path: 'src/a/services/A.ts' },
        { cause: 'unresolved-project-reference', path: 'src/a/services/A.ts',
          specifier: '@/missing/X' },
      ] });

    expect(facts.modules[1]).toMatchObject({ uncertainty: [], matched: ['c'],
      unverifiedDeclarations: [] });
  });

it('classifies uncertain outgoing declarations as unverified, preserving config order', () => {
  blueprint.architecture.modules![0].dependsOn = ['c', 'b'];
  write('src/a/services/A.ts', 'import(process.env.TARGET);');
  write('src/b/services/B.ts', 'import \'@/c/services/C\';');

  expect(result()).toMatchObject({ status: 'indeterminate', modules: [
    { unusedDeclarations: [], unverifiedDeclarations: ['c', 'b'] }, {}, {},
  ] });
});

it('preserves parse-failure evidence and does not mark outside parse failures uncertain', () => {
  write('src/a/services/A.ts', 'const nope: = 1;');
  write('outside/Broken.ts', 'const nope: = 1;');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'application-scope' });

  expect(facts.moduleDependencies!.modules[0].uncertainty).toEqual([
    { cause: 'parse-failure', path: 'src/a/services/A.ts', detail: expect.any(String) },
  ]);

  expect(facts.moduleDependencies!.modules[1].uncertainty).toEqual([]);
});

it('distinguishes unresolved and unclassified targets from known outside targets', () => {
  write('src/a/services/A.ts',
    'import \'./Missing\'; import \'@/unknown/Other\'; import \'../../../outside/Tool\';');

  write('src/unknown/Other.ts');
  write('outside/Tool.ts');

  expect(result()!.modules[0].uncertainty).toEqual([
    { cause: 'unresolved-project-reference', path: 'src/a/services/A.ts', specifier: './Missing' },
    { cause: 'unresolved-project-reference', path: 'src/a/services/A.ts',
      specifier: '@/unknown/Other' },
  ]);
});

it('reports vacuous equality, module runway, and no layer-first graph separately', () => {
  fs.rmSync(path.join(root, 'src'), { recursive: true });

  blueprint.architecture.modules!.forEach((module) => {
    module.dependsOn = [];
  });

  expect(result()).toMatchObject({ status: 'synchronized', modules: [
    { reach: 'vacuous' }, { reach: 'vacuous' }, { reach: 'vacuous' },
  ] });

  blueprint.architecture.modules = [];
  expect(result()).toEqual({ status: 'runway', modules: [] });
  delete blueprint.architecture.modules;
  expect(result()).toBeNull();
});

it('respects test scope, lint exclusion boundaries, and governed identity', () => {
  blueprint.architecture.testFiles = ['**/*.spec.ts'];
  blueprint.architecture.layerFilesIgnore = ['**/A.ts'];
  blueprint.architecture.consumerFiles = ['**/*'];
  write('src/a/services/A.ts', 'import \'@/c/services/C\';');
  write('src/a/services/A.spec.ts', 'import \'@/b/services/B\'; import(process.env.TARGET);');

  expect(result()!.modules[0]).toMatchObject({ missingDeclarations: ['c'],
    unusedDeclarations: ['b'], uncertainty: [] });

  blueprint.architecture.testFiles = [];

  expect(result()!.modules[0]).toMatchObject({ matched: ['b'], unusedDeclarations: [],
    uncertainty: [{ cause: 'runtime-dependent-import', path: 'src/a/services/A.spec.ts' }] });
});

it('counts additional aliases and private root imports using canonical module identity', () => {
  blueprint.architecture.additionalAliases = { '~': 'src' };
  write('src/b/private.ts');
  write('src/a/services/A.ts', 'import \'~/b/private\'; import \'../../b/private\';');

  expect(result()!.modules[0].observedDirect).toEqual([
    { from: 'a', to: 'b', references: 2, permission: 'direct', evidence: [
      { path: 'src/a/services/A.ts', specifier: '../../b/private' },
      { path: 'src/a/services/A.ts', specifier: '~/b/private' },
    ] },
  ]);
});

it('accepts collected files without optional parser metadata', async () => {
  const { reconcileModuleDependencies } = await import('./module-dependencies');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  for (const file of facts.governedFiles) {
    delete file.importAnalysis;
  }

  expect(reconcileModuleDependencies(facts)!.modules.map((row) => row.uncertainty))
    .toEqual([[], [], []]);
});

it('sorts derived targets and uncertainty; preserves declaration order', () => {
  blueprint.architecture.modules![0].dependsOn = ['c', 'b'];
  write('src/c/services/Z.ts', 'import \'@/b/services/B\'; import \'@/a/services/A\';');
  write('src/a/services/A.ts');
  write('src/b/services/Z.ts', 'import \'./ZMissing\'; import \'./AMissing\';');
  write('src/b/services/A.ts', 'import \'./Missing\';');
  const facts = result()!;

  expect(facts.modules[0].unusedDeclarations).toEqual(['c', 'b']);
  expect(facts.modules[2].missingDeclarations).toEqual(['a', 'b']);
  expect(facts.modules[2].observedDirect.map((edge) => edge.to)).toEqual(['a', 'b']);

  expect(facts.modules[1].uncertainty).toEqual([
    { cause: 'unresolved-project-reference', path: 'src/b/services/A.ts', specifier: './Missing' },
    { cause: 'unresolved-project-reference', path: 'src/b/services/Z.ts', specifier: './AMissing' },
    { cause: 'unresolved-project-reference', path: 'src/b/services/Z.ts', specifier: './ZMissing' },
  ]);
});
