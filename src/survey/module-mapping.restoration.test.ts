import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import type { LayerToModuleObligation } from '../project';
import { collectModuleToLayerEvidence, destinationCollisions } from './module-mapping';
import { runSurvey } from './survey';

const dirs: string[] = [];

const architecture: ArchitectureDef = {
  alias: '~app',
  modules: [{ name: 'babyoasis', does: 'composition' }],
  layers: [{ name: 'services', does: 'data', layout: 'file' }],
};

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-restoration-'));

  dirs.push(root);
  fs.mkdirSync(path.join(root, 'src/babyoasis'), { recursive: true });

  for (const [file, content] of Object.entries({
    'index.tsx': 'import { logic } from \'./logic\'; export { Baby } from \'./Baby\';'
      + ' export const Account = logic;',
    'logic.ts': 'export const logic = 1;',
    'Baby.tsx': 'export const Baby = 2;',
    'new.ts': 'export const added = 3;',
  })) {
    fs.writeFileSync(path.join(root, 'src/babyoasis', file), content);
  }

  return root;
}

function origin(): LayerToModuleObligation {
  const units = [
    { unit: 'Account', members: [['Screen.tsx', 'index.tsx'], ['logic.ts', 'logic.ts']] },
    { unit: 'Baby', members: [['Screen.tsx', 'Baby.tsx']] },
    { unit: 'Removed', members: [['Screen.tsx', 'removed.tsx']] },
  ];

  return {
    version: 1, direction: 'layer-first-to-module-first',
    origin: {
      head: 'abc', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      layers: [{ name: 'containers', does: 'composition', layout: 'folder', entry: 'Screen' }],
      sources: units.map(({ unit, members }) => ({
        role: 'container-seed', unit: `containers/${unit}`,
        members: members.map(([member]) => `src/containers/${unit}/${member}`),
      })),
    },
    target: {
      topology: 'module-first',
      decisions: units.map(({ unit, members }) => ({
        source: `containers/${unit}`,
        destinations: members.map(([, destination]) => `src/babyoasis/${destination}`),
        members: members.map(([source, destination]) => ({
          source: `src/containers/${unit}/${source}`, destination: `src/babyoasis/${destination}`,
        })),
      })),
    },
  };
}

afterEach(() => {
  for (const root of dirs.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('root mapping completeness and restoration', () => {
  it('accounts for live members and entries without fabricating removed units', () => {
    const root = fixture();
    const retained = origin();

    const evidence = collectModuleToLayerEvidence({
      root, survey: runSurvey(root, { sourceRoot: 'src', log: () => {} }),
      architecture, nextAppRouter: false, origin: retained,
    });

    expect(evidence.architectureBasis.layers).toEqual(retained.origin.layers);
    expect(evidence.collisions).toEqual([]);

    expect(evidence.mappings.map(({ source, destination, restoration, originUnit, reason }) =>
      ({ source, destination, restoration, originUnit, reason }))).toEqual([{
      source: 'src/babyoasis/new.ts', destination: undefined,
      restoration: 'requires-decision', originUnit: undefined, reason: 'unmapped-origin-member',
    }, {
      source: 'src/babyoasis/logic.ts', destination: 'src/containers/Account/logic.ts',
      restoration: 'restored-from-origin', originUnit: 'containers/Account', reason: undefined,
    }, {
      source: 'src/babyoasis/index.tsx', destination: 'src/containers/Account/Screen.tsx',
      restoration: 'restored-from-origin', originUnit: 'containers/Account', reason: undefined,
    }, {
      source: 'src/babyoasis/Baby.tsx', destination: 'src/containers/Baby/Screen.tsx',
      restoration: 'restored-from-origin', originUnit: 'containers/Baby', reason: undefined,
    }]);
  });

  it.each(['react', 'vue'] as const)('uses the central root membership for %s', (framework) => {
    const root = fixture();

    fs.mkdirSync(path.join(root, 'src/babyoasis/private'));

    fs.writeFileSync(path.join(root, 'src/babyoasis/private/nested.ts'),
      'export const nested = 1;');

    fs.writeFileSync(path.join(root, 'src/babyoasis/View.vue'), '<template><div /></template>');

    const evidence = collectModuleToLayerEvidence({
      root, survey: runSurvey(root, { sourceRoot: 'src', log: () => {} }),
      architecture, nextAppRouter: false, framework,
    });

    expect(evidence.mappings.some((mapping) => mapping.source.endsWith('nested.ts'))).toBe(false);

    expect(evidence.mappings.some((mapping) => mapping.source.endsWith('View.vue')))
      .toBe(framework === 'vue');

    expect(evidence.orphans).toEqual(framework === 'vue'
      ? ['src/babyoasis/private/nested.ts']
      : ['src/babyoasis/View.vue', 'src/babyoasis/private/nested.ts']);
  });

  it('keeps incomplete mapping members in place when checking destination collisions', () => {
    const basis = { module: 'example', layer: 'containers', layout: 'container' as const,
      disposition: 'move' as const };

    expect(destinationCollisions([{
      ...basis, source: 'src/example/index.ts', destination: 'src/containers/Screen.ts',
    }, {
      ...basis, source: 'src/containers/Screen.ts', restoration: 'requires-decision',
    }], ['src/containers/Screen.ts'])).toEqual([{
      destination: 'src/containers/screen.ts',
      sources: ['src/containers/Screen.ts', 'src/example/index.ts'],
    }]);
  });
});
