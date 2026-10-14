import { expect, it } from 'vitest';
import type { Blueprint, Framework, MustNotCapability } from '../config';
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

function documents(
  framework: Framework,
  detected: ProjectState['framework'],
  capability: MustNotCapability,
): string[] {
  const bp: Blueprint = { framework, architecture: { alias: '@', layers: [{
    name: 'domain', does: 'policy', mustNot: [{
      id: 'ban', description: 'own framework state', checks: [{ capability }],
    }],
  }] }, emit: { agents: ['agents', 'cursor'] } };

  const actions = plan(project(detected), bp, { install: false });
  const paths = ['docs/architecture-handbook.md', 'AGENTS.md', '.cursor/rules/blueprint.mdc'];

  return paths.map((path) => {
    const action = actions.find((candidate) =>
      candidate.kind === 'write' && candidate.path === path);

    if (action?.kind !== 'write') {
      throw new Error(`Missing generated document ${path}`);
    }

    return action.content;
  });
}

it('keeps auto detection unresolved instead of inventing React support', () => {
  const unknown = documents('auto', 'auto', 'react-state');

  expect(unknown).toEqual(documents('auto', null, 'react-state'));
  expect(unknown).toHaveLength(3);

  for (const text of unknown) {
    expect(text).toContain('ban: own framework state [unavailable');
    expect(text).not.toContain('ban: own framework state [lint backed');
  }
});

it('uses detected Vue support when the blueprint framework is auto', () => {
  for (const text of documents('auto', 'vue', 'vue-reactivity')) {
    expect(text).toContain('ban: own framework state [lint backed');
    expect(text).not.toContain('ban: own framework state [unavailable');
    expect(text).toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue};');
  }
});

it.each([
  { framework: 'react', detected: 'vue', check: 'react-state', exts: 'js,jsx,ts,tsx' },
  { framework: 'vue', detected: 'react', check: 'vue-reactivity', exts: 'js,jsx,ts,tsx,vue' },
] as const)('prefers declared $framework over detected $detected', (row) => {
  const { framework, detected, check, exts } = row;

  for (const text of documents(framework, detected, check)) {
    expect(text).toContain('ban: own framework state [lint backed');
    expect(text).not.toContain('ban: own framework state [unavailable');
    expect(text).toContain(`Governed files: src/domain/**/*.{${exts}};`);
  }
});
