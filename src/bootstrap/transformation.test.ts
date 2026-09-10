import { describe, expect, it } from 'vitest';

import type { ProjectState } from '../project';
import type { TransformationEvidence } from '../survey';
import type { TransformationPreflight } from './preflight';
import { runLayerToModuleTransformation, transformationActions } from './transformation';

function state(): ProjectState {
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

    expect(actions.some((action) => action.kind === 'install')).toBe(false);
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
        target: 'module-first',
        source: 'classified',
        selectedApplication: null,
        operation: 'transformation-required',
        path: 'transformation',
      },
    })).rejects.toThrow('application scope: Exactly one application scope must be selected');
  });
});
