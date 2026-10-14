import { expect, it } from 'vitest';
import type { Blueprint } from '../config';
import type { ProjectState } from '../project';
import { plan } from './plan';

function project(framework: ProjectState['framework']): ProjectState {
  return {
    root: '/x', applicationRoot: '/x', toolchainRoot: '/x',
    localPackage: { root: '/x', scripts: {}, dependencies: [] },
    toolchainPackage: { root: '/x', scripts: {}, dependencies: [] },
    framework, packageManager: 'npm', projectName: 'app', hasConfig: true,
    hasEslintConfig: false, wiredEslintConfig: false, hasNext: false, hasNuxt: false,
    nextRouter: null, nextSrcDir: false, hasViteConfig: false, hasTypescript: false,
    tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': null },
    existingSrcDirs: [], missingDeps: [], applicationMissingDeps: [], dependencies: [],
  };
}

it.each(['react', null] as const)('propagates detected framework %j', (framework) => {
  const bp: Blueprint = { framework: 'auto', architecture: { alias: '@', layers: [{
    name: 'domain', does: 'policy', mustNot: [{
      id: 'state', description: 'own state', checks: [{ capability: 'react-state' }],
    }],
  }] }, emit: { agents: ['agents', 'cursor'] } };

  const actions = plan(project(framework), bp, { install: false });

  const paths = ['docs/architecture-handbook.md', 'AGENTS.md', '.cursor/rules/blueprint.mdc'];

  for (const path of paths) {
    const action = actions.find((candidate) =>
      candidate.kind === 'write' && candidate.path === path);

    expect(action?.kind).toBe('write');

    if (action?.kind === 'write') {
      expect(action.content).toContain(framework === 'react'
        ? 'state: own state [lint backed'
        : 'state: own state [unavailable');
    }
  }
});
