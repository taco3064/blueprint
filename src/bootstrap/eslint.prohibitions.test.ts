import { expect, it } from 'vitest';
import type { Blueprint, Framework, LayerDef } from '../config';
import type { ProjectState } from '../project';
import { eslintConfigSource } from './eslint';

function project(framework: ProjectState['framework']): ProjectState {
  return {
    root: '/x', applicationRoot: '/x', toolchainRoot: '/x',
    localPackage: { root: '/x', scripts: {}, dependencies: [] },
    toolchainPackage: { root: '/x', scripts: {}, dependencies: [] },
    framework, packageManager: 'npm', projectName: 'app', hasConfig: true,
    hasEslintConfig: false, wiredEslintConfig: false, hasNext: false, hasNuxt: false,
    nextRouter: null, nextSrcDir: false, hasViteConfig: false, hasTypescript: false,
    tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': null },
    existingSrcDirs: [], missingDeps: [], dependencies: [],
  };
}

const executable = {
  id: 'state', description: 'own state', checks: [{ capability: 'react-state' as const }],
};

function source(
  framework: Framework,
  detected: ProjectState['framework'],
  mustNot: LayerDef['mustNot'],
): string {
  const blueprint: Blueprint = { framework, architecture: { alias: '@', layers: [
    { name: 'services', does: 'transport' },
    { name: 'domain', does: 'policy', mustNot },
  ] } };

  return eslintConfigSource(blueprint, project(detected));
}

it.each(['react', 'vue'] as const)(
  'passes detected %s into generated lint for executable auto prohibitions',
  (framework) => {
    for (const mustNot of [[executable], ['review policy', executable]]) {
      expect(source('auto', framework, mustNot)).toContain(
        `...emitLint(blueprint, { stylistic, imports, detectedFramework: '${framework}' }),`,
      );
    }
  },
);

it.each([undefined, [], ['review policy']])(
  'keeps auto detection out of lint options without executable prohibitions: %j',
  (mustNot) => {
    expect(source('auto', 'react', mustNot)).toContain(
      '...emitLint(blueprint, { stylistic, imports }),',
    );

    expect(source('auto', 'react', mustNot)).not.toContain('detectedFramework:');
  },
);

it.each(['react', 'vue'] as const)('preserves an explicit %s framework', (framework) => {
  expect(source(framework, framework === 'react' ? 'vue' : 'react', [executable]))
    .not.toContain('detectedFramework:');
});

it.each(['auto', null] as const)('omits unresolved detected framework %j', (framework) => {
  const config = source('auto', framework, [executable]);

  expect(config).toContain('...emitLint(blueprint, { stylistic, imports }),');
  expect(config).not.toContain('detectedFramework:');
});
