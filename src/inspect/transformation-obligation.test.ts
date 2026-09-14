import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader, LayerToModuleObligation, ProjectState } from '../project';
import { verifyTransformationObligation } from './transformation-obligation';

const roots: string[] = [];

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-obligation-'));

  roots.push(value);
  write(value, 'src/app/Login.ts', 'export const route = 1;\n');
  write(value, 'src/auth/components/Login.ts', 'export const login = 1;\n');

  return value;
}

function write(rootPath: string, file: string, content: string): void {
  const target = path.join(rootPath, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function blueprint(overrides: Partial<Blueprint['architecture']> = {}): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'composition' },
        { name: 'auth', does: 'authentication' },
      ],
      layers: [{ name: 'components', does: 'UI', layout: 'file' }],
      ...overrides,
    },
  };
}

function obligation(overrides: Partial<LayerToModuleObligation> = {}): LayerToModuleObligation {
  return {
    version: 1,
    direction: 'layer-first-to-module-first',
    origin: {
      head: 'origin-head',
      topology: 'layer-first',
      applicationRoot: '.',
      selectedScope: 'src',
      sourceRoot: 'src',
      framework: 'react',
      router: null,
      sources: [
        {
          role: 'route-composition',
          unit: 'pages/Login',
          members: ['src/pages/Login.ts'],
        },
        {
          role: 'container-seed',
          unit: 'containers',
          members: ['src/containers/Login.ts'],
        },
      ],
    },
    target: {
      topology: 'module-first',
      decisions: [
        {
          source: 'pages/Login', destinations: ['src/app/Login.ts'],
          members: [{ source: 'src/pages/Login.ts', destination: 'src/app/Login.ts' }],
        },
        {
          source: 'containers', destinations: ['src/auth/components/Login.ts'],
          members: [{
            source: 'src/containers/Login.ts', destination: 'src/auth/components/Login.ts',
          }],
        },
      ],
    },
    ...overrides,
  };
}

function state(rootPath: string, overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    root: rootPath,
    applicationRoot: rootPath,
    toolchainRoot: rootPath,
    localPackage: { root: rootPath, scripts: {}, dependencies: [] },
    toolchainPackage: { root: rootPath, scripts: {}, dependencies: [] },
    framework: 'react',
    packageManager: 'npm',
    hasConfig: true,
    hasEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    wiredEslintConfig: false,
    hasViteConfig: false,
    hasTypescript: true,
    tsconfigs: {},
    existingSrcDirs: [],
    missingDeps: [],
    dependencies: [],
    ...overrides,
  };
}

function git(rootPath: string, overrides: {
  repository?: { status: number; stdout: string };
  head?: { status: number; stdout: string };
  tree?: { status: number; stdout: string };
} = {}): GitReader {
  const repository = overrides.repository ?? { status: 0, stdout: `${rootPath}\n` };
  const head = overrides.head ?? { status: 0, stdout: 'origin-head\n' };

  const tree = overrides.tree ?? {
    status: 0,
    stdout: 'src/containers/Login.ts\nsrc/pages/Login.ts\n',
  };

  return (args) => {
    if (args.includes('--show-toplevel')) {
      return { ...repository, stderr: '' };
    }

    if (args[0] === 'show') {
      return {
        status: 0,
        stdout: args[1]!.includes('src/app/')
          ? 'export default 1;\n'
          : args[1]!.includes('pages/')
            ? 'export const route = 1;\n'
            : 'export const login = 1;\n',
        stderr: '',
      };
    }

    if (args[0] === 'ls-tree' && !args.includes('-r')) {
      return { status: 0, stdout: '', stderr: '' };
    }

    if (args.includes('ls-tree')) {
      return { ...tree, stderr: '' };
    }

    return { ...head, stderr: '' };
  };
}

function codes(input: {
  root: string;
  obligation?: LayerToModuleObligation;
  blueprint?: Blueprint;
  state?: ProjectState;
  git?: GitReader;
}): string[] {
  return verifyTransformationObligation({
    root: input.root,
    obligation: input.obligation ?? obligation(),
    blueprint: input.blueprint ?? blueprint(),
    state: input.state ?? state(input.root),
    git: input.git ?? git(input.root),
  }).failures.map((entry) => entry.code);
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    fs.rmSync(value, { recursive: true, force: true });
  }
});

describe('verifyTransformationObligation authority', () => {
  it('matches Git inventory with CRLF output', () => {
    const dir = root();

    expect(codes({
      root: dir,
      git: git(dir, {
        tree: { status: 0, stdout: 'src/containers/Login.ts\r\nsrc/pages/Login.ts\r\n' },
      }),
    })).toEqual([]);
  });

  it('accepts a complete obligation', () => {
    const dir = root();

    write(dir, '.blueprint-baseline.json', '{"version":2,"findings":[]}\n');

    expect(verifyTransformationObligation({
      root: dir,
      obligation: obligation(),
      blueprint: blueprint(),
      state: state(dir),
      git: git(dir),
    })).toEqual({ ok: true, failures: [] });
  });

  it('reports unavailable and changed repository authority', () => {
    const dir = root();

    const unavailable = codes({
      root: dir,
      git: git(dir, {
        repository: { status: 1, stdout: '' },
        head: { status: 1, stdout: '' },
      }),
    });

    expect(unavailable).toEqual(expect.arrayContaining([
      'repository-root-unavailable',
      'origin-head-changed',
      'application-root-changed',
    ]));

    expect(codes({
      root: dir,
      git: git(dir, { head: { status: 0, stdout: 'other-head\n' } }),
    })).toContain('origin-head-changed');
  });

  it('reports changed framework, router, application, and source scope', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.applicationRoot = 'apps/web';
    changed.origin.selectedScope = 'other';

    expect(codes({
      root: dir,
      obligation: changed,
      state: state(dir, { framework: 'vue', nextRouter: 'pages' }),
    })).toEqual(expect.arrayContaining([
      'framework-changed',
      'router-changed',
      'application-root-changed',
      'source-scope-changed',
    ]));
  });

  it.each([
    ['absolute application', '/outside', 'src'],
    ['escaping source', '.', '../outside'],
    ['empty source', '.', ''],
  ])('rejects unsafe origin scope: %s', (_name, applicationRoot, sourceRoot) => {
    const dir = root();
    const changed = obligation();

    changed.origin.applicationRoot = applicationRoot;
    changed.origin.sourceRoot = sourceRoot;
    changed.origin.selectedScope = sourceRoot;

    expect(codes({ root: dir, obligation: changed })).toContain('unsafe-origin-scope');
  });
});

describe('verifyTransformationObligation origin inventory', () => {
  it('reports duplicate, missing, added, and role-mismatched sources', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources = [
      changed.origin.sources[0],
      { ...changed.origin.sources[0] },
      {
        role: 'route-composition',
        unit: 'containers',
        members: ['src/containers/Login.ts'],
      },
      {
        role: 'container-seed',
        unit: 'containers/Added',
        members: ['src/containers/Added/index.ts'],
      },
    ];

    expect(verifyTransformationObligation({
      root: dir, obligation: changed, blueprint: blueprint(), state: state(dir), git: git(dir),
    }).failures).toEqual(expect.arrayContaining([
      { code: 'duplicate-origin-unit' },
      { code: 'origin-source-mismatch', subject: 'containers' },
      { code: 'unrecorded-origin-source', subject: 'containers/Added' },
      { code: 'origin-role-mismatch', subject: 'containers' },
    ]));
  });

  it('derives nested container seeds and ignores unrelated committed source', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources[1] = {
      role: 'container-seed',
      unit: 'containers/Login',
      members: [
        'src/containers/Login/index.ts',
        'src/containers/Login/view.ts',
      ],
    };

    changed.target.decisions[1].source = 'containers/Login';
    write(dir, 'src/auth/components/View.ts', 'export const login = 1;\n');
    changed.target.decisions[1].destinations.push('src/auth/components/View.ts');

    changed.target.decisions[1].members = [
      { source: 'src/containers/Login/index.ts', destination: 'src/auth/components/Login.ts' },
      { source: 'src/containers/Login/view.ts', destination: 'src/auth/components/View.ts' },
    ];

    const tree = [
      'src/components/Ignore.ts',
      'src/containers/Login/view.ts',
      'src/pages/Login.ts',
      'src/containers/Login/index.ts',
      'src/root.ts',
      'src/pages/readme.md',
    ].join('\n');

    expect(codes({
      root: dir,
      obligation: changed,
      git: git(dir, { tree: { status: 0, stdout: tree } }),
    })).toEqual([]);
  });

  it.each(['', 'src/pages/Login.ts\n'])(
    'rejects failed Git inventory for seedless obligations with stdout %j', (stdout) => {
      const dir = root();
      const seedless = obligation();

      seedless.origin.sources = [];
      seedless.target.decisions = [];

      expect(verifyTransformationObligation({
        root: dir, state: state(dir), blueprint: blueprint(), obligation: seedless,
        git: git(dir, { tree: { status: 1, stdout } }),
      })).toEqual({
        ok: false,
        failures: [{ code: 'origin-inventory-unavailable', expected: 'origin-head' }],
      });
    },
  );
});

describe('verifyTransformationObligation decisions', () => {
  it('requires one known destination decision per source', () => {
    const dir = root();
    const changed = obligation();

    changed.target.decisions = [
      changed.target.decisions[0],
      { ...changed.target.decisions[0] },
      { source: 'unknown', members: [], destinations: ['src/auth/components/Login.ts'] },
      { source: 'containers', members: [], destinations: [] },
    ];

    expect(codes({ root: dir, obligation: changed })).toEqual(expect.arrayContaining([
      'duplicate-decision',
      'unknown-decision-source',
      'missing-destination-decision',
    ]));
  });

  it('rejects unsafe, missing, and wrongly positioned destinations', () => {
    const dir = root();
    const changed = obligation();

    changed.target.decisions = [
      {
        source: 'pages/Login',
        members: [],
        destinations: ['../outside', 'src/app/Missing.ts', 'src/auth/components/Login.ts'],
      },
      { source: 'containers', members: [], destinations: ['src/app/Login.ts'] },
    ];

    expect(codes({ root: dir, obligation: changed })).toEqual(expect.arrayContaining([
      'unsafe-destination',
      'destination-missing',
      'route-destination-not-app',
      'container-destination-not-module',
    ]));
  });

  it('rejects unsafe or remaining source members', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources[1].members = ['../outside', 'src/containers/Login.ts'];
    write(dir, 'src/containers/Login.ts', 'export const old = 1;\n');

    expect(verifyTransformationObligation({
      root: dir, obligation: changed, blueprint: blueprint(), state: state(dir), git: git(dir),
    }).failures).toEqual(expect.arrayContaining([
      { code: 'unsafe-source-member', subject: '../outside' },
      { code: 'source-member-remains', subject: 'src/containers/Login.ts' },
    ]));
  });

  it('rejects destinations whose real path escapes through a symlink', () => {
    const dir = root();
    const outside = path.join(os.tmpdir(), `blueprint-outside-${path.basename(dir)}.ts`);
    const target = path.join(dir, 'src/app/Login.ts');

    fs.writeFileSync(outside, 'export const outside = 1;\n');
    fs.rmSync(target);
    fs.symlinkSync(outside, target);

    try {
      expect(codes({ root: dir })).toContain('unsafe-destination');
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe('verifyTransformationObligation final state', () => {
  it('requires module-first with reserved app and no repeated legacy roles', () => {
    const dir = root();

    expect(codes({
      root: dir,
      blueprint: blueprint({ modules: undefined, layers: [
        { name: 'pages', does: 'routes' },
        { name: 'containers', does: 'features' },
      ] }),
    })).toEqual(expect.arrayContaining([
      'target-not-module-first',
      'reserved-app-absent',
      'recorded-role-repeated',
    ]));

    expect(codes({
      root: dir,
      blueprint: blueprint({ modules: [{ name: 'auth', does: 'auth' }] }),
    })).toContain('reserved-app-absent');
  });

  it('reports parser degradation and fresh architecture errors', () => {
    const parseDir = root();

    write(parseDir, 'src/auth/components/Broken.ts', 'export const = ;\n');
    expect(codes({ root: parseDir })).toContain('final-import-analysis-failed');

    const architectureDir = root();

    write(architectureDir, 'src/rogue/file.ts', 'export const rogue = 1;\n');
    expect(codes({ root: architectureDir })).toContain('final-architecture-errors');
  });

  it('accepts an obligation containing only a container seed', () => {
    const dir = root();
    const container = obligation();

    container.origin.sources = [container.origin.sources[1]];
    container.target.decisions = [container.target.decisions[1]];

    expect(codes({
      root: dir,
      obligation: container,
      git: git(dir, { tree: { status: 0, stdout: 'src/containers/Login.ts\n' } }),
    })).toEqual([]);
  });
});
