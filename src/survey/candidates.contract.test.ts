import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { collectTransformationEvidence } from './candidates';
import type { TransformationEvidence } from './candidates';
import { runSurvey } from './survey';

const dirs: string[] = [];

function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-candidates-contract-'));

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

function complexEvidence(): TransformationEvidence {
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

function expectSummary(result: TransformationEvidence): void {
  expect({
    sourceRoot: result.sourceRoot,
    aliases: result.aliases,
    resolutionBasis: result.resolutionBasis,
    rootWiring: result.rootWiring,
    seedSource: result.seedSource,
    unknownDynamicImports: result.unknownDynamicImports,
    parseFailures: result.parseFailures,
  }).toEqual({
    sourceRoot: 'src',
    aliases: { '~app': 'src' },
    resolutionBasis: 'survey-detected',
    rootWiring: ['main.ts'],
    seedSource: 'containers',
    unknownDynamicImports: 1,
    parseFailures: [],
  });

  expect(result.sourceLayers).toEqual([
    { layer: 'components', units: ['components/Form'] },
    { layer: 'containers', units: ['containers/Login', 'containers/Register'] },
    { layer: 'contexts', units: ['contexts/session'] },
    { layer: 'hooks', units: ['hooks/useSession'] },
    { layer: 'icons', units: ['icons/Logo'] },
    { layer: 'pages', units: ['pages/Home'] },
    { layer: 'services', units: ['services/auth'] },
  ]);
}

function expectCandidates(result: TransformationEvidence): void {
  expect(result.candidates).toEqual([
    {
      seed: 'containers/Login',
      source: 'container',
      reachableUnits: [
        'components/Form',
        'containers/Login',
        'contexts/session',
        'hooks/useSession',
        'services/auth',
      ],
      directImports: [
        { from: 'containers/Login', to: 'components/Form', count: 2 },
        { from: 'containers/Login', to: 'hooks/useSession', count: 1 },
        { from: 'containers/Login', to: 'services/auth', count: 1 },
      ],
      closureEdges: [
        { from: 'containers/Login', to: 'components/Form', count: 2 },
        { from: 'containers/Login', to: 'hooks/useSession', count: 1 },
        { from: 'containers/Login', to: 'services/auth', count: 1 },
        { from: 'contexts/session', to: 'services/auth', count: 1 },
        { from: 'services/auth', to: 'contexts/session', count: 1 },
      ],
      closureConsumers: [
        { from: 'containers/Register', to: 'components/Form', count: 1 },
        { from: 'containers/Register', to: 'hooks/useSession', count: 1 },
        { from: 'pages/Home', to: 'containers/Login', count: 1 },
      ],
      unresolvedAliasLikeImports: [
        'hooks/useSession: ~missing/session',
        'hooks/useSession: ~missing/token',
      ],
    },
    {
      seed: 'containers/Register',
      source: 'container',
      reachableUnits: ['components/Form', 'containers/Register', 'hooks/useSession'],
      directImports: [
        { from: 'containers/Register', to: 'components/Form', count: 1 },
        { from: 'containers/Register', to: 'hooks/useSession', count: 1 },
      ],
      closureEdges: [
        { from: 'containers/Register', to: 'components/Form', count: 1 },
        { from: 'containers/Register', to: 'hooks/useSession', count: 1 },
      ],
      closureConsumers: [
        { from: 'containers/Login', to: 'components/Form', count: 2 },
        { from: 'containers/Login', to: 'hooks/useSession', count: 1 },
      ],
      unresolvedAliasLikeImports: [
        'hooks/useSession: ~missing/session',
        'hooks/useSession: ~missing/token',
      ],
    },
  ]);
}

function expectRouter(result: TransformationEvidence): void {
  expect(result.routerCandidates).toEqual([
    {
      seed: 'pages/Home',
      source: 'page',
      reachableUnits: [
        'components/Form',
        'containers/Login',
        'contexts/session',
        'hooks/useSession',
        'pages/Home',
        'services/auth',
      ],
      directImports: [{ from: 'pages/Home', to: 'containers/Login', count: 1 }],
      closureEdges: [
        { from: 'containers/Login', to: 'components/Form', count: 2 },
        { from: 'containers/Login', to: 'hooks/useSession', count: 1 },
        { from: 'containers/Login', to: 'services/auth', count: 1 },
        { from: 'contexts/session', to: 'services/auth', count: 1 },
        { from: 'pages/Home', to: 'containers/Login', count: 1 },
        { from: 'services/auth', to: 'contexts/session', count: 1 },
      ],
      closureConsumers: [
        { from: 'containers/Register', to: 'components/Form', count: 1 },
        { from: 'containers/Register', to: 'hooks/useSession', count: 1 },
      ],
      unresolvedAliasLikeImports: [
        'hooks/useSession: ~missing/session',
        'hooks/useSession: ~missing/token',
      ],
    },
  ]);
}

function expectRemainder(result: TransformationEvidence): void {
  expect({
    overlaps: result.overlaps,
    orphans: result.orphans,
    edges: result.edges,
    cycles: result.cycles,
    collisionRisks: result.collisionRisks,
    unresolvedAliasLikeImports: result.unresolvedAliasLikeImports,
    relativeImports: result.relativeImports,
  }).toEqual({
    overlaps: [
      { unit: 'components/Form', seeds: ['containers/Login', 'containers/Register'] },
      { unit: 'hooks/useSession', seeds: ['containers/Login', 'containers/Register'] },
    ],
    orphans: ['icons/Logo'],
    edges: [
      { from: 'containers/Login', to: 'components/Form', count: 2 },
      { from: 'containers/Login', to: 'hooks/useSession', count: 1 },
      { from: 'containers/Login', to: 'services/auth', count: 1 },
      { from: 'containers/Register', to: 'components/Form', count: 1 },
      { from: 'containers/Register', to: 'hooks/useSession', count: 1 },
      { from: 'contexts/session', to: 'services/auth', count: 1 },
      { from: 'pages/Home', to: 'containers/Login', count: 1 },
      { from: 'services/auth', to: 'contexts/session', count: 1 },
    ],
    cycles: [['contexts/session', 'services/auth', 'contexts/session']],
    collisionRisks: [],
    unresolvedAliasLikeImports: [
      { unit: 'hooks/useSession', specifier: '~missing/session' },
      { unit: 'hooks/useSession', specifier: '~missing/token' },
    ],
    relativeImports: [{
      importer: 'containers/Register',
      specifier: '../../components/Form',
      structuralTarget: 'components/Form',
      targetUnitMeasured: true,
    }],
  });
}

describe('collectTransformationEvidence contract', () => {
  it('preserves the complete graph for containers, routes, and unresolved imports', () => {
    const result = complexEvidence();

    expectSummary(result);
    expectCandidates(result);
    expectRouter(result);
    expectRemainder(result);
  });
});
