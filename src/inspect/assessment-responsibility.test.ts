import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { collectArchitectureFacts } from './facts';
import { responsibilityItems } from './assessment-responsibility';

let root: string;
let blueprint: Blueprint;

function write(file: string, source = 'export {};'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function items() {
  return responsibilityItems('.', blueprint,
    collectArchitectureFacts(root, blueprint, { demand: 'governed-source' }));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-responsibility-'));

  blueprint = {
    framework: 'react',
    architecture: {
      alias: '@', modules: [{ name: 'shop', does: 'Shopping' }],
      layers: [{ name: 'views', does: 'Present information', layout: 'file',
        mustNot: ['Fetch', 'Persist'] }],
    },
  };
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('groups complete sorted layer files and only does with no prohibition duplication', () => {
  write('src/shop/views/Z.ts');
  write('src/shop/views/A.ts');
  const result = items();

  expect(result.map((item) => item.id)).toEqual(['layer-responsibility', 'module-ownership']);

  expect(result[0]).toEqual({
    id: 'layer-responsibility', application: '.', subject: 'src/shop/views',
    sourceKey: 'src/shop/views', lane: 'review', status: 'review-required',
    claim: renderAssessmentClaim('layer-responsibility'), source: 'resolved-architecture',
    evidence: { position: 'src/shop/views', does: 'Present information',
      files: ['src/shop/views/A.ts', 'src/shop/views/Z.ts'] },
    reach: 'covered', limitations: ['semantic-responsibility-not-machine-proven'],
    signals: [], affectsExit: false, nextStep: renderAssessmentNextStep('review-responsibility'),
  });

  expect(result[1].signals).toEqual([]);

  expect(result[1].evidence).toMatchObject({ module: 'shop', root: 'src/shop',
    does: 'Shopping', rootUnit: null, incoming: 0, outgoing: 0,
    layers: [{ position: 'src/shop/views', does: 'Present information',
      files: ['src/shop/views/A.ts', 'src/shop/views/Z.ts'] }] });
});

it('empty layers are declaratory without fabricating a root or module review', () => {
  expect(items()).toEqual([expect.objectContaining({
    id: 'layer-responsibility', lane: 'reach', status: 'declaratory', reach: 'vacuous',
    nextStep: null, evidence: { position: 'src/shop/views', does: 'Present information',
      files: [] },
  })]);
});

it('module runway retains doctrine without any optional root', () => {
  blueprint.architecture.modules = [];

  expect(items()).toEqual([expect.objectContaining({
    id: 'module-runway', sourceKey: 'src', reach: 'runway', status: 'declaratory',
    evidence: { layers: [{ name: 'views', does: 'Present information' }] },
  })]);
});

it('root responsibility retains source facts without inferring a destination',
  () => {
    write('src/shop/index.ts', 'export * from "./helper";');
    write('src/shop/helper.ts');
    const result = items();

    expect(result.map((item) => item.id)).toEqual([
      'layer-responsibility', 'module-root-responsibility', 'module-ownership',
    ]);

    expect(result[1]).toMatchObject({ status: 'review-required', reach: 'covered',
      evidence: { module: 'shop', root: 'src/shop', entry: 'src/shop/index.ts',
        entries: ['src/shop/index.ts'], members: ['src/shop/helper.ts', 'src/shop/index.ts'],
        guidance: 'owner-review', destination: null } });

    expect(result[2].signals).toEqual(['root-source-present']);
    expect(result[2].evidence).toMatchObject({ layers: [] });
  });

it('excludes test and ignored source from root and layer occupancy', () => {
  blueprint.architecture.layerFilesIgnore = ['src/shop/index.ts', 'src/shop/views/Ignored.ts'];
  write('src/shop/index.ts');
  write('src/shop/helper.test.ts');
  write('src/shop/views/Ignored.ts');

  expect(items().map((item) => [item.id, item.status])).toEqual([
    ['layer-responsibility', 'declaratory'],
  ]);
});

it('reserved app source does not create an ordinary root or ownership item', () => {
  blueprint.architecture.modules!.push({ name: 'app', does: 'Routes' });
  write('src/app/index.ts');
  expect(items().map((item) => item.id)).toEqual(['layer-responsibility']);
});

it('layer-first responsibility groups source without module assumptions', () => {
  delete blueprint.architecture.modules;
  write('src/views/A.ts');
  write('src/views-extra/B.ts');

  expect(items().map((item) => item.evidence)).toEqual([
    { position: 'src/views', does: 'Present information', files: ['src/views/A.ts'] },
  ]);
});

it('retains observed graph and prioritization signals without proving ownership', () => {
  blueprint.architecture.modules = [
    { name: 'shop', does: 'Shopping', dependsOn: ['base'] },
    { name: 'other', does: 'Other' },
    { name: 'base', does: 'Domain-specific base' },
  ];

  write('src/shop/views/A.ts', 'import "@/base/views/B";');
  write('src/other/views/O.ts', 'import "@/base/views/B"; import(variable);');
  write('src/base/views/B.ts');
  const result = items().filter((item) => item.id === 'module-ownership');

  expect(result.map((item) => [item.sourceKey, item.signals])).toEqual([
    ['src/shop', []],
    ['src/other', ['dependency-drift', 'analysis-indeterminate']],
    ['src/base', ['multiple-observed-consumers', 'dependency-base']],
  ]);

  expect(result[0].evidence).toMatchObject({ incoming: 0, outgoing: 1,
    dependencies: { declaredDirect: ['base'], reachable: ['base'],
      observedDirect: [{ from: 'shop', to: 'base', references: 1, permission: 'direct',
        evidence: [{ path: 'src/shop/views/A.ts', specifier: '@/base/views/B' }] }] } });

  expect(result[2].evidence).toMatchObject({ incoming: 2, outgoing: 0 });

  expect(result.map((item) => item.status)).toEqual([
    'review-required', 'review-required', 'review-required',
  ]);
});

it('one consumer is a dependency base; unused declarations are drift',
  () => {
    blueprint.architecture.modules = [
      { name: 'shop', does: 'Shop', dependsOn: ['base', 'unused'] },
      { name: 'base', does: 'Base' },
      { name: 'unused', does: 'Unused' },
    ];

    write('src/shop/views/A.ts', 'import "@/base/views/B";');
    write('src/base/views/B.ts');

    expect(items().filter((item) => item.id === 'module-ownership')
      .map((item) => [item.sourceKey, item.signals])).toEqual([
      ['src/shop', ['dependency-drift']], ['src/base', ['dependency-base']],
    ]);
  });

it('occupied ordinary module with misplaced nested source still requires ownership review', () => {
  write('src/shop/unknown/Source.ts');
  write('src/shop-other/unknown/Other.ts');

  expect(items().map((item) => [item.id, item.sourceKey])).toEqual([
    ['layer-responsibility', 'src/shop/views'], ['module-ownership', 'src/shop'],
  ]);
});

it('a module with incoming and outgoing edges is not a dependency base', () => {
  blueprint.architecture.modules = [
    { name: 'a', does: 'A', dependsOn: ['b'] },
    { name: 'b', does: 'B', dependsOn: ['c'] },
    { name: 'c', does: 'C' },
  ];

  write('src/a/views/A.ts', 'import "@/b/views/B";');
  write('src/b/views/B.ts', 'import "@/c/views/C";');
  write('src/c/views/C.ts');

  expect(items().filter((item) => item.id === 'module-ownership')
    .map((item) => [item.sourceKey, item.signals])).toEqual([
    ['src/a', []], ['src/b', []], ['src/c', ['dependency-base']],
  ]);
});

it('stabilizes path order and preserves application identity',
  () => {
    write('src/shop/views/A.ts');
    write('src/shop/views/Z.ts');
    const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

    facts.governedFiles.reverse();
    const result = responsibilityItems('apps/shop', blueprint, facts);

    expect(result.map((item) => item.application)).toEqual(['apps/shop', 'apps/shop']);

    expect(result[0].evidence).toEqual({ position: 'src/shop/views', does: 'Present information',
      files: ['src/shop/views/A.ts', 'src/shop/views/Z.ts'] });
  });

it.each(['react',
  'vue'] as const)('canonical %s preset without retained provenance still requires owner review',
  async (framework) => {
    const { reactPreset, vuePreset } = await import('../presets');

    blueprint = (framework === 'react' ? reactPreset : vuePreset)({
      modules: [{ name: 'shop', does: 'Shopping' }],
    });

    write('src/shop/index.ts');
    const result = items().find((item) => item.id === 'module-root-responsibility');

    expect(result).toMatchObject({ status: 'review-required', affectsExit: false,
      evidence: { guidance: 'owner-review', destination: null } });
  });
