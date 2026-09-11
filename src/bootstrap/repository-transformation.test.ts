import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArchitectureDef, Blueprint } from '../config';
import { detect } from '../project';
import type { RepositoryBlueprint } from '../project';
import { runRepositoryTopologyTransformation } from './repository-transformation';

const roots: string[] = [];

const layerArchitecture: ArchitectureDef = {
  alias: '~app',
  sourceRoot: 'source',
  layers: [{ name: 'pages', does: 'routes' }],
};

const moduleArchitecture: ArchitectureDef = {
  alias: '~app',
  sourceRoot: 'source',
  modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'hooks', does: 'state' }],
};

// The fixture writes two complete applications and commits their shared repository.
// eslint-disable-next-line max-statements
function workspace(
  current: 'layer-first' | 'module-first',
  router: 'app' | 'none' | 'pages' | 'unresolved' = 'none',
  rootApplication = false,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-repository-transform-'));
  const architecture = current === 'layer-first' ? layerArchitecture : moduleArchitecture;
  const blueprints: RepositoryBlueprint[] = [];

  roots.push(root);

  for (const [index, name] of ['admin', 'web'].entries()) {
    const applicationRoot = rootApplication && index === 0
      ? root
      : path.join(root, 'apps', name);

    const dependencies: Record<string, string> = { react: '^18' };

    if (router !== 'none') {
      dependencies.next = '^15';
    }

    fs.mkdirSync(path.join(applicationRoot, 'source'), { recursive: true });

    fs.writeFileSync(path.join(applicationRoot, 'package.json'), JSON.stringify({
      name, dependencies,
    }));

    fs.writeFileSync(
      path.join(applicationRoot, 'blueprint.config.mjs'),
      `export default ${JSON.stringify({ framework: 'react', architecture })};\n`,
    );

    const sourceFile = current === 'layer-first'
      ? path.join(applicationRoot, 'source', 'pages', 'Home.ts')
      : path.join(applicationRoot, 'source', 'auth', 'hooks', 'useAuth.ts');

    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, 'export const value = 1;\n');

    fs.writeFileSync(
      path.join(applicationRoot, 'source', 'bootstrap.ts'),
      'export const bootstrap = true;\n',
    );

    if (router === 'none') {
      fs.mkdirSync(path.join(applicationRoot, 'src', 'pages'), { recursive: true });

      fs.writeFileSync(
        path.join(applicationRoot, 'src', 'Decoy.ts'),
        'export const decoy = true;\n',
      );
    }

    if (router === 'pages') {
      fs.mkdirSync(path.join(applicationRoot, 'src', 'pages'), { recursive: true });
    }

    if (router === 'app') {
      fs.mkdirSync(path.join(applicationRoot, 'src', 'app'), { recursive: true });
    }

    const blueprint: Blueprint = { framework: 'react', architecture };

    blueprints.push({ applicationRoot, architecture, blueprint, topology: current });
  }

  expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);

  expect(spawnSync('git', [
    '-c', 'user.name=Blueprint',
    '-c', 'user.email=blueprint@example.invalid',
    'commit', '--quiet', '-m', 'baseline',
  ], { cwd: root }).status).toBe(0);

  return { root, architecture, blueprints };
}

function input(
  current: 'layer-first' | 'module-first',
  router: 'app' | 'none' | 'pages' | 'unresolved' = 'none',
  rootApplication = false,
) {
  const fixture = workspace(current, router, rootApplication);

  return {
    ...fixture,
    request: {
      root: fixture.blueprints[1].applicationRoot,
      state: detect(fixture.blueprints[1].applicationRoot),
      options: { install: false },
      log: vi.fn(),
      survey: null,
      architecture: fixture.architecture,
      repositoryBlueprints: fixture.blueprints,
      topology: {
        current,
        repository: current,
        target: current === 'layer-first' ? 'module-first' as const : 'layer-first' as const,
        source: 'configured' as const,
        selectedApplication: 'src',
        operation: 'transformation-required' as const,
        path: 'transformation' as const,
      },
    },
  };
}

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe('repository-wide topology transformation', () => {
  it('describes every action without writing during a dry run', async () => {
    const fixture = input('layer-first', 'none', true);

    const actions = await runRepositoryTopologyTransformation({
      ...fixture.request,
      state: { ...fixture.request.state, repositoryRoot: undefined },
      options: { ...fixture.request.options, dryRun: true },
    });

    const playbook = actions.find((action) => action.kind === 'write'
      && action.path === 'blueprint-authoring.md');

    expect(actions).toHaveLength(3);
    expect(fixture.request.log).toHaveBeenCalledWith(expect.stringContaining('would write'));
    expect(playbook).toMatchObject({ kind: 'write' });

    if (playbook?.kind === 'write') {
      expect(playbook.content).toContain('`source` inside one 2-application');
      expect(playbook.content).toContain('`../../source` inside one 2-application');
      expect(playbook.content).toContain('pages/Home');
      expect(playbook.content).toContain('Source-root bootstrap/wiring: `bootstrap.ts`');
      expect(playbook.content).not.toContain('Decoy.ts');
      expect(playbook.content).toContain('npm install -D @kekkai/blueprint');
    }

    expect(fs.existsSync(path.join(fixture.root, 'blueprint-authoring.md'))).toBe(false);
  });

  it('launches an explicitly selected agent from the repository root', async () => {
    const fixture = input('module-first', 'app');
    const spawn = vi.fn(() => ({ status: 0 }));

    await runRepositoryTopologyTransformation({
      ...fixture.request,
      options: { ...fixture.request.options, agent: 'codex', spawn },
    });

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      fixture.request.state.repositoryRoot,
    );

    expect(fs.readFileSync(path.join(fixture.root, 'blueprint-authoring.md'), 'utf8')).toContain(
      'Flatten `apps/admin/source` as one work unit',
    );

    expect(fs.readFileSync(
      path.join(fixture.root, '.claude', 'commands', 'blueprint-author.md'),
      'utf8',
    )).toContain('Read blueprint-authoring.md at the repository root');
  });

  it('rejects all applications before writing when one preflight is dirty', async () => {
    const fixture = input('layer-first');

    fs.writeFileSync(
      path.join(fixture.blueprints[0].applicationRoot, 'source', 'dirty.ts'),
      'export const dirty = true;\n',
    );

    try {
      await runRepositoryTopologyTransformation(fixture.request);
      expect.unreachable('Expected a dirty repository preflight to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/clean worktree.*No files were changed/is);
      expect((error as Error).message).toMatch(/apps\/(?:admin|web) · clean worktree/);
      expect((error as Error).message).not.toContain('Git repository: undefined');
      expect((error as Error).message).not.toContain('recoverable HEAD: undefined');
    }

    expect(fs.existsSync(path.join(fixture.root, 'blueprint-authoring.md'))).toBe(false);
  });

  it('rejects an unresolved Next router for a layer-first repository', async () => {
    const fixture = input('layer-first', 'unresolved');

    await expect(runRepositoryTopologyTransformation(fixture.request)).rejects.toThrow(
      /Cannot verify a Next\.js App Router surface/,
    );
  });

  it('reports a Pages router identity for a layer-first repository', async () => {
    const fixture = input('layer-first', 'pages');

    await expect(runRepositoryTopologyTransformation(fixture.request)).rejects.toThrow(
      /router state is pages/,
    );
  });

  it('rejects an unresolved router for a module-first repository', async () => {
    const fixture = input('module-first', 'unresolved');

    await expect(runRepositoryTopologyTransformation(fixture.request)).rejects.toThrow(
      /router state is unresolved/,
    );
  });
});
