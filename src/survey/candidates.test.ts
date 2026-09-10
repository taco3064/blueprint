import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { collectTransformationEvidence } from './candidates';
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

describe('layer-first transformation candidates', () => {
  it('exposes container closures, overlaps, cycles, orphans, and import limits', () => {
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
      'src/components/button.ts': 'export const lower = 1;\n',
      'src/Components/Button.ts': 'export const upper = 1;\n',
      'src/hooks/session.ts': 'export const lowerHook = 1;\n',
      'src/Hooks/Session.ts': 'export const upperHook = 1;\n',
      'src/icons/Logo.ts': 'export const Logo = 1;\n',
      'src/pages/Home.ts': 'const lazy = import(target);\nexport { lazy };\n',
      'src/main.ts': 'export const bootstrap = 1;\n',
    });

    const survey = runSurvey(root, { log: () => {} });
    const result = collectTransformationEvidence(root, survey);

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

    expect(result.edges).toContainEqual({
      from: 'containers/Login',
      to: 'components/Form',
      count: 2,
    });

    expect(result.cycles).toEqual([['contexts/session', 'services/auth', 'contexts/session']]);
    expect(result.orphans).toEqual(expect.arrayContaining(['icons/Logo', 'pages/Home']));

    expect(result.collisionRisks).toEqual([
      { identity: 'components/button', units: ['Components/Button', 'components/button'] },
      { identity: 'hooks/session', units: ['Hooks/Session', 'hooks/session'] },
    ]);

    expect(result.unresolvedImports).toEqual([
      { unit: 'hooks/useSession', specifier: '~missing/session' },
      { unit: 'hooks/useSession', specifier: '~missing/token' },
    ]);

    expect(result.unknownDynamicImports).toBe(1);
  });

  it('falls back to page islands without assigning domain ownership', () => {
    const root = repo({
      'src/pages/Login.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/pages/Shop.ts': 'import \'~app/services/catalog\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
      'src/services/catalog.ts': 'export const catalog = 1;\n',
    });

    const result = collectTransformationEvidence(root, runSurvey(root, { log: () => {} }));

    expect(result.seedSource).toBe('pages');
    expect(result.routerSeeds).toEqual(['pages/Login', 'pages/Shop']);

    expect(result.candidates).toMatchObject([
      { seed: 'pages/Login', source: 'page', reachableUnits: ['hooks/useAuth', 'pages/Login'] },
      { seed: 'pages/Shop', source: 'page', reachableUnits: ['pages/Shop', 'services/catalog'] },
    ]);
  });

  it('defaults an omitted survey source root to src', () => {
    const root = repo({ 'src/pages/Home.ts': 'export const home = 1;\n' });
    const survey = runSurvey(root, { log: () => {} });

    expect(collectTransformationEvidence(root, { ...survey, sourceRoot: undefined }).sourceRoot)
      .toBe('src');
  });
});
