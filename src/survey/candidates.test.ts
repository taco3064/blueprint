import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { buildUnitGraph, scan } from '../inspect';
import { collectTransformationEvidence, collisionsOf } from './candidates';
import { runSurvey } from './survey';

const dirs: string[] = [];

function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-candidates-'));

  dirs.push(root);

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { react: '^18.0.0', z: '^1.0.0', 'long-package': '^1.0.0' },
  }));

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

function complexEvidence() {
  const root = repo({
    'src/containers/Login/index.ts': [
      'import \'~app/components/Form\';',
      'export { Form } from \'~app/components/Form\';',
      'import \'~app/hooks/useSession\';',
      'void import(\'~app/services/auth\');',
    ].join('\n'),
    'src/containers/Register/index.ts': [
      'import \'../../components/Form\';',
      'import \'~app/hooks/useSession\';',
    ].join('\n'),
    'src/components/Form.ts': 'export const Form = 1;\n',
    'src/hooks/useSession.ts': [
      'import \'~missing/session\';',
      'import \'~missing/token\';',
      'export const session = 1;',
    ].join('\n'),
    'src/services/auth.ts': 'import \'~app/contexts/session\';\nexport const auth = 1;\n',
    'src/contexts/session.ts': 'import \'~app/services/auth\';\nexport const session = 1;\n',
    'src/icons/Logo.ts': 'export const Logo = 1;\n',
    'src/pages/Home.ts': [
      'import \'~app/containers/Login\';',
      'const lazy = import(target);',
      'export { lazy };',
    ].join('\n'),
    'src/main.ts': 'export const bootstrap = 1;\n',
  });

  return collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));
}

describe('layer-first transformation candidates', () => {
  it('exposes container closures, overlaps, cycles, orphans, and import limits', () => {
    const result = complexEvidence();

    expect(result.seedSource).toBe('containers');

    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([
      'containers/Login',
      'containers/Register',
    ]);

    expect(result.candidates[0].reachableUnits).toEqual(expect.arrayContaining([
      'components/Form',
      'contexts/session',
      'hooks/useSession',
      'services/auth',
    ]));

    expect(result.overlaps).toEqual(expect.arrayContaining([
      { unit: 'components/Form', seeds: ['containers/Login', 'containers/Register'] },
      { unit: 'hooks/useSession', seeds: ['containers/Login', 'containers/Register'] },
    ]));

    expect(result.candidates[0].directImports).toContainEqual({
      from: 'containers/Login',
      to: 'components/Form',
      count: 2,
    });

    expect(result.candidates[0].closureEdges.length).toBeGreaterThan(0);

    expect(result.candidates[0].closureConsumers).toContainEqual({
      from: 'pages/Home',
      to: 'containers/Login',
      count: 1,
    });

    expect(result.routerCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        seed: 'pages/Home',
        reachableUnits: expect.arrayContaining(['containers/Login', 'hooks/useSession']),
      }),
    ]));

    expect(result.cycles).toEqual([['contexts/session', 'services/auth', 'contexts/session']]);
    expect(result.orphans).toEqual(expect.arrayContaining(['icons/Logo']));
    expect(result.orphans).not.toContain('pages/Home');

    expect(result.unresolvedAliasLikeImports).toEqual([
      { unit: 'hooks/useSession', specifier: '~missing/session' },
      { unit: 'hooks/useSession', specifier: '~missing/token' },
    ]);

    expect(result.unknownDynamicImports).toBe(1);
  });

  it('detects case-folded collision risks without relying on filesystem case sensitivity', () => {
    expect(collisionsOf(new Set([
      'components/button',
      'Components/Button',
      'hooks/session',
      'Hooks/Session',
    ]))).toEqual([
      { identity: 'components/button', units: ['Components/Button', 'components/button'] },
      { identity: 'hooks/session', units: ['Hooks/Session', 'hooks/session'] },
    ]);
  });
});

describe('layer-first transformation route evidence', () => {
  it('falls back to page islands without assigning domain ownership', () => {
    const root = repo({
      'src/pages/Login.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/pages/Shop.ts': 'import \'~app/services/catalog\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
      'src/services/catalog.ts': 'export const catalog = 1;\n',
    });

    const result = collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));

    expect(result.seedSource).toBe('pages');

    expect(result.routerCandidates.map((candidate) => candidate.seed)).toEqual([
      'pages/Login', 'pages/Shop',
    ]);

    expect(result.candidates).toMatchObject([
      { seed: 'pages/Login', source: 'page', reachableUnits: ['hooks/useAuth', 'pages/Login'] },
      { seed: 'pages/Shop', source: 'page', reachableUnits: ['pages/Shop', 'services/catalog'] },
    ]);
  });

  it('defaults an omitted survey source root to src', () => {
    const root = repo({ 'src/pages/Home.ts': 'export const home = 1;\n' });

    fs.rmSync(path.join(root, 'tsconfig.json'));
    const survey = runSurvey(root, { log: () => {} });

    expect(collectTransformationEvidence(root, { ...survey, sourceRoot: undefined }).sourceRoot)
      .toBe('src');
  });

  it('normalizes a root-scoped detected alias without inventing a config authority', () => {
    const root = repo({ 'src/pages/Home.ts': 'export const home = 1;\n' });
    const survey = runSurvey(root, { log: () => {} });

    const result = collectTransformationEvidence(root, {
      ...survey,
      sourceRoot: './',
      aliases: { '@root': './' },
    });

    expect(result.resolutionBasis).toBe('survey-detected');
  });

  it('keeps physical routes when the canonical graph uses layer-granularity units', () => {
    const root = repo({
      'src/pages/Home.ts': [
        'import \'~app/containers/Login\';',
        'import \'react\';',
      ].join('\n'),
      'src/containers/Login.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
    });

    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: ['pages', 'containers', 'hooks'].map((name) => ({ name, does: name })),
    };

    const result = collectTransformationEvidence(
      root,
      runSurvey(root, { log: () => {} }),
      architecture,
    );

    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        seed: 'containers',
        source: 'container',
        reachableUnits: ['containers', 'hooks'],
      }),
    ]));

    expect(result.routerCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        seed: 'pages/Home',
        directImports: [{ from: 'pages/Home', to: 'containers', count: 1 }],
        reachableUnits: ['containers', 'hooks', 'pages/Home'],
      }),
    ]));
  });
});

describe('layer-first transformation canonical resolution', () => {
  it('uses config-authoritative aliases and the inspect/deps unit graph', () => {
    const root = repo({
      'src/containers/Login/index.ts': [
        'import \'@source/hooks/useAuth\';',
        'import \'../../hooks/useAuth\';',
        'import \'../../hooks/missing\';',
        'import \'../../../outside/value\';',
        'void import(\'~services/session\');',
        'import \'~missing/owner\';',
      ].join('\n'),
      'src/hooks/useAuth/index.ts': 'export const auth = 1;\n',
      'src/services/session/index.ts': 'export const session = 1;\n',
      'src/unknown/X.ts': 'import \'./Y\';\n',
    });

    const architecture: ArchitectureDef = {
      alias: '@source',
      sourceRoot: 'src',
      additionalAliases: { '~services': 'src/services' },
      layers: ['containers', 'hooks', 'services'].map((name) => ({
        name,
        does: name,
        layout: 'folder' as const,
      })),
    };

    const result = collectTransformationEvidence(
      root,
      runSurvey(root, { log: () => {} }),
      architecture,
    );

    const canonical = buildUnitGraph(scan(root, 'src'), architecture);

    expect(result.resolutionBasis).toBe('blueprint-config');

    expect(result.aliases).toEqual({
      '@source': 'src',
      '~services': 'src/services',
    });

    expect(result.edges).toEqual([
      { from: 'containers/Login', to: 'hooks/missing', count: 1 },
      { from: 'containers/Login', to: 'hooks/useAuth', count: 2 },
      { from: 'containers/Login', to: 'services/session', count: 1 },
    ]);

    const canonicalEdges = [...canonical.edges]
      .flatMap(([from, targets]) => [...targets].map((to) => [from, to]))
      .sort();

    expect(result.edges.map(({ from, to }) => [from, to])).toEqual(canonicalEdges);

    expect(result.relativeImports).toEqual(expect.arrayContaining([
      {
        importer: 'containers/Login',
        specifier: '../../hooks/missing',
        structuralTarget: 'hooks/missing',
        targetUnitMeasured: false,
      },
      {
        importer: 'containers/Login',
        specifier: '../../hooks/useAuth',
        structuralTarget: 'hooks/useAuth',
        targetUnitMeasured: true,
      },
      {
        importer: 'containers/Login',
        specifier: '../../../outside/value',
        structuralTarget: null,
        targetUnitMeasured: false,
      },
      {
        importer: 'src/unknown/X.ts',
        specifier: './Y',
        structuralTarget: null,
        targetUnitMeasured: false,
      },
    ]));

    expect(result.unresolvedAliasLikeImports).toEqual([
      { unit: 'containers/Login', specifier: '~missing/owner' },
    ]);
  });
});
