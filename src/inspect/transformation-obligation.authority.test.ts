import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader, LayerToModuleObligation, ProjectState } from '../project';
import { analyze } from './analyze';
import { renderBaseline } from './baseline';
import { scan } from './scan';
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

function verify(dir: string, options: {
  obligation?: LayerToModuleObligation;
  blueprint?: Blueprint;
  git?: GitReader;
  state?: ProjectState;
} = {}) {
  return verifyTransformationObligation({
    root: dir, state: state(dir), obligation: obligation(), blueprint: blueprint(),
    git: git(dir), ...options,
  });
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    fs.rmSync(value, { recursive: true, force: true });
  }
});

describe('transformation obligation authority evidence', () => {
  it('rejects failed Git commands even when their stdout resembles valid evidence', () => {
    const dir = root();

    expect(verify(dir, { git: git(dir, {
      repository: { status: 1, stdout: dir },
      head: { status: 1, stdout: 'origin-head' },
      tree: { status: 1, stdout: 'src/containers/Login.ts\nsrc/pages/Login.ts\n' },
    }) }).failures).toEqual(expect.arrayContaining([
      { code: 'repository-root-unavailable' },
      { code: 'origin-head-changed', expected: 'origin-head' },
      { code: 'origin-inventory-unavailable', expected: 'origin-head' },
    ]));
  });

  it('compares resolved source root independently of the recorded selected scope', () => {
    const dir = root();

    expect(verify(dir, { blueprint: blueprint({ sourceRoot: 'source' }) }).failures)
      .toContainEqual({ code: 'source-scope-changed' });
  });

  it.each([
    ['..', 'src'], ['.', '..'], ['../outside', 'src'], ['.', '../outside'],
  ])('does not request inventory outside %s / %s', (applicationRoot, sourceRoot) => {
    const dir = root();
    const changed = obligation();
    const reader = vi.fn(git(dir));

    changed.origin.applicationRoot = applicationRoot;
    changed.origin.sourceRoot = sourceRoot;
    changed.origin.selectedScope = sourceRoot;

    expect(verify(dir, { obligation: changed, git: reader }).failures)
      .toContainEqual({ code: 'unsafe-origin-scope' });

    expect(reader.mock.calls.some(([args]) => args.includes('ls-tree'))).toBe(false);
  });

  it.each(['.', 'apps/web'])(
    'requests repository-relative inventory for app %s', (applicationRoot) => {
      const repository = root();
      const dir = path.join(repository, applicationRoot);

      fs.mkdirSync(dir, { recursive: true });
      write(dir, 'src/app/Login.ts', 'export const route = 1;\n');
      write(dir, 'src/auth/components/Login.ts', 'export const login = 1;\n');
      const changed = obligation();

      changed.origin.applicationRoot = applicationRoot;
      const prefix = applicationRoot === '.' ? '' : `${applicationRoot}/`;

      const reader = vi.fn(git(repository, {
        tree: { status: 0, stdout: `${prefix}src/containers/Login.ts\n${prefix}src/pages/Login.ts\n` },
      }));

      expect(verify(dir, { obligation: changed, git: reader })).toEqual({ ok: true, failures: [] });

      expect(reader).toHaveBeenCalledWith([
        'ls-tree', '-r', '--name-only', 'origin-head', '--', `${prefix}src`,
      ], repository);
    },
  );
});

describe('transformation obligation inventory and final evidence', () => {
  it('accepts a seedless obligation only with a successfully read empty inventory', () => {
    const dir = root();
    const seedless = obligation();

    seedless.origin.sources = [];
    seedless.target.decisions = [];

    expect(verify(dir, {
      obligation: seedless, git: git(dir, { tree: { status: 0, stdout: '' } }),
    })).toEqual({ ok: true, failures: [] });
  });

  it('compares members even when the role and unit have not changed', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources[0].members = ['src/pages/Other.ts'];

    expect(verify(dir, { obligation: changed }).failures)
      .toContainEqual({ code: 'origin-source-mismatch', subject: 'pages/Login' });
  });

  it('requires every recorded route member to have a route role', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources[0].members.push('src/containers/Other.ts');

    expect(verify(dir, { obligation: changed }).failures)
      .toContainEqual({ code: 'origin-role-mismatch', subject: 'pages/Login' });
  });

  it('allows an original app route member to remain for Next App Router', () => {
    const dir = root();
    const next = obligation();

    next.origin.router = 'app';

    next.origin.sources = [{
      role: 'route-composition',
      unit: 'app/login',
      members: ['src/app/login/page.tsx'],
    }];

    next.target.decisions = [{
      source: 'app/login',
      destinations: ['src/app/login/page.tsx'],
      members: [{ source: 'src/app/login/page.tsx', destination: 'src/app/login/page.tsx' }],
    }];

    write(dir, 'src/app/login/page.tsx', 'export default 1;\n');

    expect(verify(dir, {
      obligation: next,
      state: state(dir, { nextRouter: 'app' }),
      git: git(dir, { tree: { status: 0, stdout: 'src/app/login/page.tsx\n' } }),
    })).toEqual({ ok: true, failures: [] });
  });

  it('ignores source-looking backup files and preserves dots in route unit names', () => {
    const dir = root();
    const changed = obligation();

    changed.origin.sources[0] = {
      role: 'route-composition', unit: 'pages/Login.route', members: ['src/pages/Login.route.ts'],
    };

    changed.target.decisions[0].source = 'pages/Login.route';
    changed.target.decisions[0].members[0].source = 'src/pages/Login.route.ts';

    expect(verify(dir, { obligation: changed, git: git(dir, {
      tree: {
        status: 0,
        stdout: 'src/containers/Login.ts\nsrc/pages/Login.route.ts\nsrc/pages/Backup.ts.old\n',
      },
    }) })).toEqual({ ok: true, failures: [] });
  });

  it('does not permit a baseline to hide remaining architecture errors', () => {
    const dir = root();
    const config = blueprint();

    write(dir, 'src/rogue/file.ts', 'export const rogue = 1;\n');
    const findings = analyze(scan(dir, 'src'), config, []);
    const errors = findings.filter((finding) => finding.severity === 'error');

    expect(errors.length).toBeGreaterThan(0);
    write(dir, '.blueprint-baseline.json', renderBaseline(findings));

    expect(verify(dir).failures).toContainEqual({
      code: 'final-architecture-errors', actual: String(errors.length),
    });
  });

  it.each(['route-composition', 'container-seed'] as const)(
    'rejects only the repeated layer associated with recorded %s', (role) => {
      const dir = root();
      const changed = obligation();

      changed.origin.sources = changed.origin.sources.filter((source) => source.role === role);
      changed.target.decisions = [];

      const result = verify(dir, {
        obligation: changed,
        blueprint: blueprint({ layers: [
          { name: 'pages', does: 'routes' },
          { name: 'containers', does: 'features' },
          { name: 'Stryker was here', does: 'other' },
        ] }),
      });

      expect(result.failures.filter((entry) => entry.code === 'recorded-role-repeated'))
        .toEqual([{
          code: 'recorded-role-repeated',
          subject: role === 'route-composition' ? 'pages' : 'containers',
        }]);
    },
  );
});

describe('transformation obligation parent destinations', () => {
  it('rejects absolute relative-path results from different filesystem volumes', () => {
    const dir = root();
    const relative = vi.spyOn(path, 'relative').mockReturnValue('/other-volume');

    try {
      expect(verify(dir).failures).toContainEqual({
        code: 'unsafe-destination', subject: 'src/app/Login.ts',
      });
    } finally {
      relative.mockRestore();
    }
  });

  it('rejects the exact lexical parent directory', () => {
    const dir = root();
    const changed = obligation();

    changed.target.decisions[0].destinations = ['..'];

    expect(verify(dir, { obligation: changed }).failures)
      .toContainEqual({ code: 'unsafe-destination', subject: '..' });
  });

  it('rejects a destination junction resolving to the exact real parent', () => {
    const dir = root();
    const changed = obligation();

    fs.symlinkSync(path.dirname(dir), path.join(dir, 'parent'), 'junction');
    changed.target.decisions[0].destinations = ['parent'];

    expect(verify(dir, { obligation: changed }).failures)
      .toContainEqual({ code: 'unsafe-destination', subject: 'parent' });
  });
});

describe('transformation destination diagnostics', () => {
  it.each([
    ['../outside', 'unsafe-destination'],
    ['src/app/Missing.ts', 'destination-missing'],
    ['src/auth/File.ts', 'route-destination-not-app'],
  ])('preserves diagnostic subject for %s', (destination, code) => {
    const dir = root();
    const changed = obligation();

    write(dir, 'src/auth/File.ts', 'export const route = 1;\n');
    changed.target.decisions[0].destinations = [destination];

    expect(verify(dir, { obligation: changed }).failures)
      .toContainEqual({ code, subject: destination });
  });

  it('rejects layer-first destinations without dereferencing a null module', () => {
    const dir = root();
    const changed = obligation();
    const config = blueprint();

    delete config.architecture.modules;
    write(dir, 'src/components/File.ts', 'export const login = 1;\n');
    changed.target.decisions[1].destinations = ['src/components/File.ts'];

    expect(verify(dir, { obligation: changed, blueprint: config }).failures)
      .toContainEqual({
        code: 'container-destination-not-module', subject: 'src/components/File.ts',
      });
  });

  it('retains the unit on duplicate, unknown, and missing decisions', () => {
    const dir = root();
    const changed = obligation();

    changed.target.decisions.push({ ...changed.target.decisions[0] });
    changed.target.decisions.push({ source: 'unknown', destinations: [], members: [] });
    changed.target.decisions[1].destinations = [];

    expect(verify(dir, { obligation: changed }).failures).toEqual(expect.arrayContaining([
      { code: 'duplicate-decision', subject: 'pages/Login' },
      { code: 'unknown-decision-source', subject: 'unknown' },
      { code: 'missing-destination-decision', subject: 'containers' },
    ]));
  });
});

describe('transformation obligation portable artifact paths', () => {
  it.each([
    '', 'C:relative', 'c:', 'C:\\absolute', 'C:/absolute', '\\\\server\\share\\file',
    '\\rooted', '/absolute', '..', '../outside', '..\\outside', 'src\\..\\..\\outside',
  ])('rejects unsafe artifact path %j on every host', (value) => {
    const dir = root();
    const destination = obligation();

    destination.target.decisions[0].destinations = [value];

    expect(verify(dir, { obligation: destination }).failures)
      .toContainEqual({ code: 'unsafe-destination', subject: value });

    const origin = obligation();
    const reader = vi.fn(git(dir));

    origin.origin.applicationRoot = value;

    expect(verify(dir, { obligation: origin, git: reader }).failures)
      .toContainEqual({ code: 'unsafe-origin-scope' });

    expect(reader.mock.calls.some(([args]) => args.includes('ls-tree'))).toBe(false);
  });

  it.each(['src/app/Login.ts', './src/app/Login.ts', 'src/../src/app/Login.ts'])(
    'retains safe relative destination %j', (value) => {
      const dir = root();
      const changed = obligation();

      changed.target.decisions[0].destinations = [value];

      expect(verify(dir, { obligation: changed }).failures)
        .not.toContainEqual({ code: 'unsafe-destination', subject: value });
    },
  );
});
