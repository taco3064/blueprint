import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import type { Framework } from '../config';
import { detect } from '../project';
import { runModuleToLayerTransformation } from './module-to-layer-transformation';
import { runTopologyTransformation } from './transformation-dispatch';
import type { ModuleToLayerInput } from './module-to-layer-transformation';

const dirs: string[] = [];

const architecture = {
  alias: '~app', modules: [{ name: 'auth', does: 'composition' }],
  layers: [{ name: 'services', does: 'data' }],
};

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-reverse-framework-'));

  dirs.push(root);
  fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/auth/index.vue'), '<template><div /></template>');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'framework' }));

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'),
    `export default ${JSON.stringify({ framework: 'vue', architecture })};`);

  for (const args of [
    ['init', '--quiet'], ['add', '.'],
    ['-c', 'user.name=Blueprint', '-c', 'user.email=blueprint@example.invalid',
      'commit', '--quiet', '-m', 'origin'],
  ]) {
    expect(spawnSync('git', args, { cwd: root }).status).toBe(0);
  }

  return root;
}

afterEach(() => {
  for (const root of dirs.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { framework: undefined, detected: 'react', mapped: true, dispatch: true },
  { framework: 'vue', detected: 'react', mapped: true, dispatch: false },
  { framework: undefined, detected: 'react', mapped: false, dispatch: false },
  { framework: undefined, detected: 'vue', mapped: true, dispatch: false },
  { framework: undefined, detected: null, mapped: true, dispatch: false },
] satisfies {
  framework: Framework | undefined; detected: Framework | null; mapped: boolean; dispatch: boolean;
}[])('mapping framework $framework / detected $detected / dispatch $dispatch', async ({
  framework, detected, mapped, dispatch,
}) => {
  const root = fixture();

  const input: ModuleToLayerInput = {
    root, architecture, framework, state: { ...detect(root), framework: detected },
    survey: null, options: { dryRun: true, install: false }, log: () => {},
    topology: {
      current: 'module-first', repository: 'module-first', target: 'layer-first',
      source: 'configured', selectedApplication: 'src',
      operation: 'transformation-required', path: 'transformation',
    },
  };

  const actions = dispatch
    ? await runTopologyTransformation({
        ...input, repositoryBlueprints: [{
          applicationRoot: root, architecture, topology: 'module-first',
          blueprint: { framework: 'vue', architecture },
        }],
      })
    : await runModuleToLayerTransformation(input);

  const playbook = actions.find((action) => action.kind === 'write'
    && action.path === 'blueprint-authoring.md');

  expect(playbook?.kind === 'write' && playbook.content.includes('src/containers/auth/index.vue'))
    .toBe(mapped);
});
