import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ProjectState } from '../project';
import type { TransformationEvidence } from '../survey';
import type { TransformationPreflight } from './preflight';
import { runLayerToModuleTransformation, transformationActions } from './transformation';

function state(): ProjectState {
  return {
    root: '/repo',
    applicationRoot: '/repo',
    toolchainRoot: '/repo',
    localPackage: { root: '/repo', scripts: {}, dependencies: [] },
    toolchainPackage: { root: '/repo', scripts: {}, dependencies: [] },
    framework: 'react',
    packageManager: 'npm',
    hasConfig: true,
    hasEslintConfig: false,
    wiredEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    hasViteConfig: false,
    hasTypescript: true,
    tsconfigs: {},
    existingSrcDirs: [],
    missingDeps: ['@kekkai/blueprint'],
    dependencies: [],
  };
}

const evidence: TransformationEvidence = {
  sourceRoot: 'src',
  aliases: {},
  resolutionBasis: 'blueprint-config',
  rootWiring: [],
  sourceLayers: [],
  seedSource: 'none',
  candidates: [],
  routerCandidates: [],
  overlaps: [],
  orphans: [],
  edges: [],
  cycles: [],
  collisionRisks: [],
  unresolvedAliasLikeImports: [],
  relativeImports: [],
  unknownDynamicImports: 0,
  parseFailures: [],
};

const preflight: TransformationPreflight = {
  ok: true,
  repository: { ok: true, root: '/repo' },
  worktree: { ok: true, changes: [] },
  head: { ok: true, commit: 'abc' },
  scope: { ok: true, selected: 'src' },
  inspection: { ok: true, findings: [] },
};

// eslint-disable-next-line max-lines-per-function
describe('transformation actions', () => {
  it('plans installation when the package is absent', () => {
    const actions = transformationActions({
      state: state(),
      evidence,
      preflight,
      claudeDir: { hadDir: false, otherCommands: 0 },
    });

    expect(actions.some((action) => action.kind === 'install')).toBe(true);
  });

  it('prints the exact installation handoff when installation is disabled', () => {
    const actions = transformationActions({
      state: state(),
      evidence,
      preflight,
      install: false,
      claudeDir: { hadDir: true, otherCommands: 2 },
    });

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'instruct',
      note: expect.stringContaining('npm install -D @kekkai/blueprint'),
    }));
  });

  it('omits installation and accepts inspection evidence without a findings list', () => {
    const current = state();

    current.missingDeps = [];

    const actions = transformationActions({
      state: current,
      evidence,
      preflight: { ...preflight, inspection: { ok: true } },
      claudeDir: { hadDir: false, otherCommands: 0 },
    });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);

    const playbook = actions.find((action) => action.kind === 'write'
      && action.path === 'blueprint-authoring.md');

    expect(playbook).toMatchObject({ kind: 'write' });

    if (playbook?.kind === 'write') {
      expect(playbook.content).not.toContain('Stryker was here');
      expect(playbook.content).not.toContain('undefined');
    }
  });

  it('rejects a transformation that has no selected application scope', async () => {
    await expect(runLayerToModuleTransformation({
      root: '/missing-repository',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      architecture: null,
      topology: {
        current: 'layer-first',
        repository: 'layer-first',
        target: 'module-first',
        source: 'configured',
        selectedApplication: null,
        operation: 'transformation-required',
        path: 'transformation',
      },
    })).rejects.toThrow('application scope: Exactly one application scope must be selected');
  });

  it('omits successful scope checks from a failed preflight report', async () => {
    const result = runLayerToModuleTransformation({
      root: '/missing-repository',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      architecture: null,
      topology: {
        current: 'layer-first',
        repository: 'layer-first',
        target: 'module-first',
        source: 'configured',
        selectedApplication: 'src',
        operation: 'transformation-required',
        path: 'transformation',
      },
    });

    try {
      await result;
      expect.unreachable('Expected preflight to reject a missing Git repository');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Git repository');
      expect((error as Error).message).not.toContain('application scope: undefined');
    }
  });

  it('applies the playbook with the injected installer and applied-action narration', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-forward-apply-'));

    try {
      fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });

      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        name: 'fixture',
        dependencies: { react: '^19.0.0' },
      }));

      fs.writeFileSync(
        path.join(root, 'src', 'components', 'Button.ts'),
        'export const Button = 1;\n',
      );

      expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);
      expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);

      expect(spawnSync('git', [
        '-c', 'user.name=Blueprint',
        '-c', 'user.email=blueprint@example.invalid',
        'commit', '--quiet', '-m', 'baseline',
      ], { cwd: root }).status).toBe(0);

      const commands: string[] = [];
      const logs: string[] = [];

      await runLayerToModuleTransformation({
        root,
        state: { ...state(), root },
        options: { exec: (command) => commands.push(command) },
        log: (message) => logs.push(message),
        survey: null,
        architecture: null,
        topology: {
          current: 'layer-first',
          repository: 'layer-first',
          target: 'module-first',
          source: 'configured',
          selectedApplication: 'src',
          operation: 'transformation-required',
          path: 'transformation',
        },
      });

      expect(commands).toEqual(['npm install -D @kekkai/blueprint']);
      expect(logs.some((message) => message.includes('  ✓ install:'))).toBe(true);
      expect(logs.some((message) => message.includes('would'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
