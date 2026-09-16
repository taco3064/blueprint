import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './bootstrap';
import { nextPreset, reactPreset } from '../presets';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-init-pristine-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const silent = () => {};

const runLayerFirstInit: typeof runInit = (projectRoot, options = {}) =>
  runInit(projectRoot, { topology: 'layer-first', ...options });

function hasAuthoringPlaybook(actions: Awaited<ReturnType<typeof runInit>>): boolean {
  return actions.some((action) => action.kind === 'write'
    && action.path === 'blueprint-authoring.md');
}

describe('runInit · pristine scaffold observations', () => {
  it('reuses a root-based Next scaffold without surveying it again', async () => {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app/page.tsx'), 'export default () => null;');

    await runLayerFirstInit(root, { install: false, log: silent });

    const actions = await runLayerFirstInit(root, {
      install: false,
      dryRun: true,
      log: silent,
      loadConfig: async () => nextPreset({ router: 'app', srcDir: false }),
    });

    expect(hasAuthoringPlaybook(actions)).toBe(false);
  });

  it('retains the selected src application when authoring takes over', async () => {
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    await runLayerFirstInit(root, { install: false, log: silent });

    const scaffoldActions = await runLayerFirstInit(root, {
      install: false,
      dryRun: true,
      log: silent,
      loadConfig: async () => nextPreset({ router: 'app', srcDir: true }),
    });

    expect(hasAuthoringPlaybook(scaffoldActions)).toBe(false);

    const actions = await runLayerFirstInit(root, {
      install: false,
      dryRun: true,
      authoring: true,
      log: silent,
      loadConfig: async () => nextPreset({ router: 'app', srcDir: true }),
    });

    const playbook = actions.find((action) => action.kind === 'write'
      && action.path === 'blueprint-authoring.md');

    expect(playbook).toMatchObject({ kind: 'write' });

    if (playbook?.kind === 'write') {
      expect(playbook.content).toContain('Source root: src');
    }
  });

  it('recognizes a generated module-first runway as its own pristine scaffold', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'react-demo', dependencies: { react: '^19' } }),
    );

    await runInit(root, {
      topology: 'module-first',
      install: false,
      log: silent,
    });

    const actions = await runInit(root, {
      topology: 'module-first',
      authoring: true,
      install: false,
      dryRun: true,
      log: silent,
      loadConfig: async () => reactPreset({ topology: 'module-first' }),
    });

    expect(hasAuthoringPlaybook(actions)).toBe(true);

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'rm',
      path: 'blueprint.config.mjs',
    }));
  });
});
