import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { collectTransformationEvidence, collisionsOf } from './candidates';
import { runSurvey } from './survey';

const dirs: string[] = [];

function repo(
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-candidates-resolution-'));

  dirs.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));

  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { paths: { '~app/*': ['./src/*'] } },
  }));

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  return root;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true });
  }
});

describe('collectTransformationEvidence resolution boundaries', () => {
  it('uses the canonical root alias exactly once', () => {
    const root = repo({ 'src/pages/Home.ts': 'export const home = 1;\n' });
    const survey = runSurvey(root, { log: () => {} });

    const result = collectTransformationEvidence(root, {
      ...survey,
      sourceRoot: 'src/',
      aliases: {
        '~components': './components',
        '@root': './src',
      },
    });

    expect(result.sourceRoot).toBe('src/');

    expect(result.aliases).toEqual({
      '~components': './components',
      '@root': 'src/',
    });
  });

  it('excludes exact and subpath package imports from unresolved aliases', () => {
    const root = repo({
      'src/hooks/useData.ts': [
        'import \'@scope/pkg\';',
        'import \'@scope/pkg/subpath\';',
        'import \'@scope/pkg-extra/subpath\';',
        'import \'@scope/unknown\';',
        'import \'package@scope/value\';',
        'import \'package#fragment\';',
      ].join('\n'),
    }, {
      '@scope/pkg': '^1.0.0',
      '@scope/pkg-extra': '^1.0.0',
    });

    const result = collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));

    expect(result.unresolvedAliasLikeImports).toEqual([
      { unit: 'hooks/useData', specifier: '@scope/unknown' },
    ]);
  });

  it('excludes an exact configured alias from unresolved imports', () => {
    const root = repo({
      'src/hooks/useData.ts': 'import \'#shared\';\n',
      'src/shared/index.ts': 'export const shared = 1;\n',
    });

    const survey = runSurvey(root, { log: () => {} });

    const result = collectTransformationEvidence(root, {
      ...survey,
      aliases: { ...survey.aliases, '#shared': 'src/shared' },
    });

    expect(result.unresolvedAliasLikeImports).toEqual([]);
  });

  it.each([
    ['nested/./src', './nested/src'],
    ['nestedsrc/', 'nested/src'],
  ])('does not mistake non-canonical alias target %s for %s', (impostor, canonical) => {
    const root = repo({ 'nested/src/pages/Home.ts': 'export const home = 1;\n' });

    const survey = runSurvey(root, { log: () => {} });

    const result = collectTransformationEvidence(root, {
      ...survey,
      sourceRoot: 'nested/src',
      aliases: { '~impostor': impostor, '~canonical': canonical },
    });

    expect(result.aliases).toEqual({
      '~impostor': impostor,
      '~canonical': 'nested/src',
    });
  });
});

describe('collectTransformationEvidence route boundaries', () => {
  it('keeps physical page evidence and excludes aggregate router units from orphans', () => {
    const root = repo({
      'src/app/Shell.ts': 'export const shell = 1;\n',
      'src/pages/Home.ts': [
        'import \'~app/services/missing\';',
        'import \'~missing/page\';',
      ].join('\n'),
    });

    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [
        { name: 'app', does: 'app' },
        { name: 'pages', does: 'pages' },
        { name: 'services', does: 'services' },
      ],
    };

    const result = collectTransformationEvidence(
      root,
      runSurvey(root, { log: () => {} }),
      architecture,
    );

    expect(result.orphans).toEqual([]);

    expect(result.routerCandidates).toEqual([
      expect.objectContaining({ seed: 'app/Shell', reachableUnits: ['app/Shell'] }),
      expect.objectContaining({
        seed: 'pages/Home',
        reachableUnits: ['pages/Home', 'services'],
        directImports: [{ from: 'pages/Home', to: 'services', count: 1 }],
        closureConsumers: [],
        unresolvedAliasLikeImports: ['pages/Home: ~missing/page'],
      }),
    ]);
  });
});

describe('collectTransformationEvidence physical route edges', () => {
  it('replaces aggregate page edges with physical route edges', () => {
    const root = repo({
      'src/app/Shell.ts': 'import \'~app/containers/Login\';\n',
      'src/pages/Home/index.ts': [
        'import \'~app/pages/Home\';',
        'import \'~app/containers/Login\';',
        'import \'~missing/route\';',
      ].join('\n'),
      'src/containers/Login.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
    });

    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [
        { name: 'app', does: 'app' },
        { name: 'pages', does: 'pages', layout: 'folder' },
        { name: 'containers', does: 'containers' },
        { name: 'hooks', does: 'hooks' },
      ],
    };

    const result = collectTransformationEvidence(
      root,
      runSurvey(root, { log: () => {} }),
      architecture,
    );

    expect(result.candidates).toEqual([{
      seed: 'containers',
      source: 'container',
      reachableUnits: ['containers', 'hooks'],
      directImports: [{ from: 'containers', to: 'hooks', count: 1 }],
      closureEdges: [{ from: 'containers', to: 'hooks', count: 1 }],
      closureConsumers: [
        { from: 'app/Shell', to: 'containers', count: 1 },
        { from: 'pages/Home', to: 'containers', count: 1 },
      ],
      unresolvedAliasLikeImports: [],
    }]);

    expect(result.routerCandidates).toEqual([
      {
        seed: 'app/Shell',
        source: 'app',
        reachableUnits: ['app/Shell', 'containers', 'hooks'],
        directImports: [{ from: 'app/Shell', to: 'containers', count: 1 }],
        closureEdges: [
          { from: 'app/Shell', to: 'containers', count: 1 },
          { from: 'containers', to: 'hooks', count: 1 },
        ],
        closureConsumers: [{ from: 'pages/Home', to: 'containers', count: 1 }],
        unresolvedAliasLikeImports: [],
      },
      {
        seed: 'pages/Home',
        source: 'page',
        reachableUnits: ['containers', 'hooks', 'pages/Home'],
        directImports: [{ from: 'pages/Home', to: 'containers', count: 1 }],
        closureEdges: [
          { from: 'containers', to: 'hooks', count: 1 },
          { from: 'pages/Home', to: 'containers', count: 1 },
        ],
        closureConsumers: [{ from: 'app/Shell', to: 'containers', count: 1 }],
        unresolvedAliasLikeImports: ['pages/Home: ~missing/route'],
      },
    ]);
  });
});

describe('collectTransformationEvidence ordering', () => {
  it('deduplicates nested routes and preserves multi-dot route identity', () => {
    const root = repo({
      'src/app/Dashboard/page.ts': 'export const dashboard = 1;\n',
      'src/app/Dashboard/loading.ts': 'export const loading = 1;\n',
      'src/pages/admin.v2/index.ts': 'export const admin = 1;\n',
      'src/pages/Home.page.ts': 'export const home = 1;\n',
    });

    const result = collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));

    expect(result.routerCandidates.map(({ seed, source }) => ({ seed, source }))).toEqual([
      { seed: 'app/Dashboard', source: 'app' },
      { seed: 'pages/Home.page', source: 'page' },
      { seed: 'pages/admin.v2', source: 'page' },
    ]);
  });

  it('sorts collision identities independently of input insertion order', () => {
    expect(collisionsOf(new Set([
      'Zeta/Button',
      'zeta/button',
      'Alpha/Card',
      'alpha/card',
    ]))).toEqual([
      { identity: 'alpha/card', units: ['Alpha/Card', 'alpha/card'] },
      { identity: 'zeta/button', units: ['Zeta/Button', 'zeta/button'] },
    ]);
  });

  it('sorts overlaps independently of when shared units are first reached', () => {
    const root = repo({
      'src/containers/A.ts': 'import \'~app/services/Zed\';\n',
      'src/containers/B.ts': 'import \'~app/services/Zed\';\n',
      'src/containers/C.ts': 'import \'~app/components/Alpha\';\n',
      'src/containers/D.ts': 'import \'~app/components/Alpha\';\n',
      'src/components/Alpha.ts': 'export const alpha = 1;\n',
      'src/services/Zed.ts': 'export const zed = 1;\n',
    });

    const result = collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));

    expect(result.overlaps).toEqual([
      { unit: 'components/Alpha', seeds: ['containers/C', 'containers/D'] },
      { unit: 'services/Zed', seeds: ['containers/A', 'containers/B'] },
    ]);
  });
});
