import { describe, expect, it } from 'vitest';

import { aliasActions, aliasPaths, patchTsconfigPaths } from './alias';
import type { ArchitectureDef } from '../config';
import type { ProjectState } from '../project';
import type { Action } from './types';

const ARCH = {
  alias: '~app',
  layers: [{ name: 'components', does: 'UI' }],
  flow: 'one-way',
  module: { layout: 'folder', entry: 'index', private: [] },
} satisfies ArchitectureDef;

const PATHS = { '~app/*': ['./src/*'] };

function state(over: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/x',
    framework: 'vue',
    packageManager: 'npm',
    hasConfig: false,
    hasEslintConfig: false,
    hasViteConfig: false,
    hasTypescript: false,
    tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': null },
    existingSrcDirs: [],
    missingDeps: [],
    ...over,
  };
}

type WriteAction = Extract<Action, { kind: 'write' }>;

const write = (actions: Action[]): WriteAction | undefined =>
  actions.find((action): action is WriteAction => action.kind === 'write');

const instructs = (actions: Action[]) =>
  actions.filter((action) => action.kind === 'instruct').map((action) => action.note);

describe('aliasPaths', () => {
  it('maps the main alias to ./src and normalizes additional alias dirs', () => {
    expect(aliasPaths(ARCH)).toEqual(PATHS);

    expect(
      aliasPaths({
        ...ARCH,
        additionalAliases: { '~shared': 'src/shared/', '~abs': '/vendor', '~rel': './lib' },
      }),
    ).toEqual({
      '~app/*': ['./src/*'],
      '~shared/*': ['./src/shared/*'],
      '~abs/*': ['/vendor/*'],
      '~rel/*': ['./lib/*'],
    });
  });
});

describe('patchTsconfigPaths', () => {
  it('rejects JSONC and shapes it cannot rewrite losslessly', () => {
    expect(patchTsconfigPaths('{ /* hi */ }', PATHS)).toEqual({ kind: 'unparseable' });
    expect(patchTsconfigPaths('null', PATHS)).toEqual({ kind: 'unparseable' });
    expect(patchTsconfigPaths('[1]', PATHS)).toEqual({ kind: 'unparseable' });
    expect(patchTsconfigPaths('{"compilerOptions": 3}', PATHS)).toEqual({ kind: 'unparseable' });
  });

  it('adds compilerOptions.paths to a config without one', () => {
    const result = patchTsconfigPaths('{"include": ["src"]}', PATHS);

    expect(result.kind).toBe('patched');

    const parsed = JSON.parse((result as { text: string }).text);

    expect(parsed).toEqual({ include: ['src'], compilerOptions: { paths: PATHS } });
  });

  it('merges into existing paths, adding only the missing aliases', () => {
    const text = JSON.stringify({
      compilerOptions: { strict: true, paths: { '~app/*': ['./app/*'], '#x/*': ['./x/*'] } },
    });

    const result = patchTsconfigPaths(text, { ...PATHS, '~shared/*': ['./src/shared/*'] });
    const parsed = JSON.parse((result as { text: string }).text);

    // The user's existing ~app mapping is left untouched; only ~shared is added.
    expect(parsed.compilerOptions.paths).toEqual({
      '~app/*': ['./app/*'],
      '#x/*': ['./x/*'],
      '~shared/*': ['./src/shared/*'],
    });

    expect(parsed.compilerOptions.strict).toBe(true);
  });

  it('is a noop when every alias is already declared', () => {
    const text = JSON.stringify({ compilerOptions: { paths: PATHS } });

    expect(patchTsconfigPaths(text, PATHS)).toEqual({ kind: 'noop' });
  });
});

describe('aliasActions', () => {
  it('creates jsconfig.json for a JS project with no config at all', () => {
    const actions = aliasActions(state(), ARCH);
    const created = write(actions);

    expect(created?.path).toBe('jsconfig.json');
    expect(JSON.parse(created?.content ?? '')).toEqual({ compilerOptions: { paths: PATHS } });
  });

  it('instructs instead of inventing a tsconfig for a TS project', () => {
    const actions = aliasActions(state({ hasTypescript: true }), ARCH);

    expect(write(actions)).toBeUndefined();
    expect(instructs(actions)[0]).toContain('tsconfig.json under compilerOptions');
  });

  it('patches a parseable tsconfig.json in place', () => {
    const actions = aliasActions(
      state({ tsconfigs: { 'tsconfig.json': '{}', 'tsconfig.app.json': null, 'jsconfig.json': null } }),
      ARCH,
    );

    expect(write(actions)?.path).toBe('tsconfig.json');
  });

  it('follows a references shell to tsconfig.app.json', () => {
    const shell = '{"files": [], "references": [{"path": "./tsconfig.app.json"}]}';

    const patched = aliasActions(
      state({ tsconfigs: { 'tsconfig.json': shell, 'tsconfig.app.json': '{}', 'jsconfig.json': null } }),
      ARCH,
    );

    expect(write(patched)?.path).toBe('tsconfig.app.json');

    // create-vite reality: the app config carries comments → instruct, not edit.
    const commented = aliasActions(
      state({
        tsconfigs: {
          'tsconfig.json': shell,
          'tsconfig.app.json': '{ /* Linting */ }',
          'jsconfig.json': null,
        },
      }),
      ARCH,
    );

    expect(write(commented)).toBeUndefined();
    expect(instructs(commented)[0]).toContain('tsconfig.app.json');
  });

  it('stays on the root when it is not a pure references shell', () => {
    const notShell = (root: string) =>
      aliasActions(
        state({ tsconfigs: { 'tsconfig.json': root, 'tsconfig.app.json': '{}', 'jsconfig.json': null } }),
        ARCH,
      );

    // Root declares its own compilerOptions → patch the root, not the app config.
    expect(write(notShell('{"references": [], "compilerOptions": {}}'))?.path).toBe('tsconfig.json');

    // A root that cannot even parse falls through to the unparseable instruct.
    const broken = notShell('{ oops');

    expect(write(broken)).toBeUndefined();
    expect(instructs(broken)[0]).toContain('tsconfig.json');
  });

  it('ignores tsconfig.app.json when there is no root shell, and patches jsconfig', () => {
    const actions = aliasActions(
      state({ tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': '{}' } }),
      ARCH,
    );

    expect(write(actions)?.path).toBe('jsconfig.json');
  });

  it('emits no write when the alias is already wired (idempotent)', () => {
    const wired = JSON.stringify({ compilerOptions: { paths: PATHS } });

    const actions = aliasActions(
      state({ tsconfigs: { 'tsconfig.json': wired, 'tsconfig.app.json': null, 'jsconfig.json': null } }),
      ARCH,
    );

    expect(write(actions)).toBeUndefined();
    expect(instructs(actions)).toHaveLength(1); // only the bundler note remains
  });

  it('tailors the bundler instruct to vite when a vite config exists', () => {
    const generic = instructs(aliasActions(state(), ARCH)).at(-1);

    expect(generic).toContain('your bundler');

    const vite = instructs(
      aliasActions(state({ hasViteConfig: true }), {
        ...ARCH,
        additionalAliases: { '~shared': 'src/shared' },
      }),
    ).at(-1);

    expect(vite).toContain('resolve: { alias: {');
    expect(vite).toContain('\'~app\': fileURLToPath(new URL(\'./src\', import.meta.url))');
    expect(vite).toContain('\'~shared\': fileURLToPath(new URL(\'./src/shared\', import.meta.url))');

    const soloAlias = instructs(aliasActions(state({ hasViteConfig: true }), ARCH)).at(-1);

    expect(soloAlias).toContain('\'~app\'');
    expect(soloAlias).not.toContain('~shared');
  });
});
