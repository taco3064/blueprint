import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import type { ProjectState } from '../project';
import type { ModuleToLayerEvidence } from '../survey';
import type { TransformationPreflight } from './preflight';
import {
  moduleToLayerActions,
  runModuleToLayerTransformation,
} from './module-to-layer-transformation';

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/repo',
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
    ...overrides,
  };
}

const evidence: ModuleToLayerEvidence = {
  sourceRoot: 'src',
  aliases: {},
  rootWiring: [],
  modules: [],
  layers: [],
  architectureBasis: { alias: '~app', layers: [] },
  aliasCutovers: [],
  mappings: [],
  collisions: [],
  orphans: [],
  edges: [],
  cycles: [],
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

const architecture: ArchitectureDef = {
  alias: '~app',
  modules: [{ name: 'auth', does: 'auth' }],
  layers: [{ name: 'hooks', does: 'state' }],
};

describe('module-first to layer-first transformation actions', () => {
  it('writes the reverse playbook and plans package installation', () => {
    const actions = moduleToLayerActions({
      state: state(),
      evidence,
      preflight,
      claudeDir: { hadDir: false, otherCommands: 0 },
    });

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'write',
      note: expect.stringContaining('module-first → layer-first'),
    }));

    expect(actions.some((action) => action.kind === 'install')).toBe(true);
  });

  it('prints the exact install handoff when installation is disabled', () => {
    const actions = moduleToLayerActions({
      state: state(),
      evidence,
      preflight,
      install: false,
      claudeDir: { hadDir: true, otherCommands: 1 },
    });

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'instruct',
      note: expect.stringContaining('npm install -D @kekkai/blueprint'),
    }));
  });

  it('omits installation when the package is already available', () => {
    const actions = moduleToLayerActions({
      state: state({ missingDeps: [] }),
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
});

describe('module-first to layer-first Agent launch', () => {
  // eslint-disable-next-line max-statements
  it('launches the requested Agent only after applying the reverse playbook', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-reverse-agent-'));

    try {
      fs.mkdirSync(path.join(root, 'src', 'auth', 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));

      fs.writeFileSync(
        path.join(root, 'blueprint.config.mjs'),
        `export default ${JSON.stringify({ framework: 'react', architecture })};\n`,
      );

      fs.writeFileSync(
        path.join(root, 'src', 'auth', 'hooks', 'useAuth.ts'),
        'export const useAuth = 1;\n',
      );

      expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);
      expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);

      expect(spawnSync('git', [
        '-c', 'user.name=Blueprint',
        '-c', 'user.email=blueprint@example.invalid',
        'commit', '--quiet', '-m', 'baseline',
      ], { cwd: root }).status).toBe(0);

      const launches: string[] = [];
      const commands: string[] = [];
      const logs: string[] = [];

      await runModuleToLayerTransformation({
        root,
        state: state({ root }),
        options: {
          agent: 'codex',
          exec: (command) => commands.push(command),
          spawn: (bin, _args, cwd) => {
            launches.push(`${bin}:${cwd}:${fs.existsSync(path.join(cwd, 'blueprint-authoring.md'))}`);

            return { status: 0 };
          },
        },
        log: (message) => logs.push(message),
        survey: null,
        topology: {
          current: 'module-first',
          target: 'layer-first',
          source: 'configured',
          selectedApplication: 'src',
          operation: 'transformation-required',
          path: 'transformation',
        },
        architecture,
      });

      expect(launches).toEqual([`codex:${root}:true`]);
      expect(commands).toEqual(['npm install -D @kekkai/blueprint']);
      expect(logs.some((message) => message.includes('  ✓ install:'))).toBe(true);
      expect(logs.some((message) => message.includes('would'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// eslint-disable-next-line max-lines-per-function
describe('module-first to layer-first transformation safety', () => {
  it('requires configured module-first authority before preflight writes', async () => {
    await expect(runModuleToLayerTransformation({
      root: '/missing',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      topology: {
        current: 'module-first',
        target: 'layer-first',
        source: 'classified',
        selectedApplication: 'src',
        operation: 'transformation-required',
        path: 'transformation',
      },
      architecture: null,
    })).rejects.toThrow(
      /init --topology module-first.*Agent author and verify.*commit the clean state.*init --topology layer-first/s,
    );
  });

  it('reports missing module authority without dereferencing an absent module list', async () => {
    await expect(runModuleToLayerTransformation({
      root: '/missing',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      topology: {
        current: 'module-first',
        target: 'layer-first',
        source: 'configured',
        selectedApplication: 'src',
        operation: 'transformation-required',
        path: 'transformation',
      },
      architecture: { alias: '~app', layers: [] },
    })).rejects.toThrow('requires the current module-first blueprint.config.mjs');
  });

  it.each(['pages', 'both', null] as const)(
    'reports the config recovery chain before unsafe Next.js %s router evidence',
    async (nextRouter) => {
      await expect(runModuleToLayerTransformation({
        root: '/missing',
        state: state({ hasNext: true, nextRouter }),
        options: { install: false },
        log: () => {},
        survey: null,
        topology: {
          current: 'module-first',
          target: 'layer-first',
          source: 'classified',
          selectedApplication: 'src',
          operation: 'transformation-required',
          path: 'transformation',
        },
        architecture: null,
      })).rejects.toThrow(
        /init --topology module-first.*Agent author and verify.*commit the clean state.*init --topology layer-first/s,
      );
    },
  );

  it.each([
    ['pages', 'only a Pages Router tree'],
    ['both', 'both App Router and Pages Router trees'],
    [null, 'no physical router tree'],
  ] as const)('rejects unsafe Next.js %s router evidence before I/O', async (nextRouter, claim) => {
    await expect(runModuleToLayerTransformation({
      root: '/missing',
      state: state({ hasNext: true, nextRouter }),
      options: { install: false },
      log: () => {},
      survey: null,
      topology: {
        current: 'module-first',
        target: 'layer-first',
        source: 'configured',
        selectedApplication: 'src',
        operation: 'transformation-required',
        path: 'transformation',
      },
      architecture,
    })).rejects.toThrow(claim);
  });

  it('rejects missing application scope through the shared preflight', async () => {
    await expect(runModuleToLayerTransformation({
      root: '/missing',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      topology: {
        current: 'module-first',
        target: 'layer-first',
        source: 'configured',
        selectedApplication: null,
        operation: 'transformation-required',
        path: 'transformation',
      },
      architecture,
    })).rejects.toThrow('application scope: Exactly one application scope must be selected');
  });

  it('omits successful scope checks from a failed preflight report', async () => {
    const result = runModuleToLayerTransformation({
      root: '/missing',
      state: state(),
      options: { install: false },
      log: () => {},
      survey: null,
      topology: {
        current: 'module-first',
        target: 'layer-first',
        source: 'configured',
        selectedApplication: 'src',
        operation: 'transformation-required',
        path: 'transformation',
      },
      architecture,
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
});
