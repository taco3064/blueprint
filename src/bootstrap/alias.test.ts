import { describe, expect, it } from 'vitest';

import { aliasActions, aliasPaths, patchTsconfigPaths } from './alias';
import type { ArchitectureDef } from '../config';
import type { ProjectState } from '../project';
import type { Action } from './types';

const ARCH = {
  alias: '~app',
  layers: [{ name: 'components', does: 'UI' }],
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
    wiredEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
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

  it('is a noop for a JSONC config whose paths are already wired (batch 10)', () => {
    // The vite template tsconfig a prior greenfield init already patched:
    // comments survive the surgery, so a re-run must recognize its own work
    // instead of instructing the user to add what is already there.
    const text = `{
      // template comments defeat JSON.parse
      "compilerOptions": {
        /* wired by init */
        "paths": { "~app/*": ["./src/*"], },
      },
    }`;

    expect(patchTsconfigPaths(text, PATHS)).toEqual({ kind: 'noop' });
  });

  it('stays unparseable when JSONC is broken or not yet fully wired', () => {
    // Still broken after comment stripping — no wiring to recognize.
    expect(patchTsconfigPaths('{ /* hi */ oops }', PATHS)).toEqual({ kind: 'unparseable' });

    // Comments but no paths at all.
    expect(patchTsconfigPaths('{ /* hi */ "compilerOptions": {} }', PATHS))
      .toEqual({ kind: 'unparseable' });

    // One alias present, one missing — a partial wire still needs the instruct.
    const partial = '{ /* hi */ "compilerOptions": { "paths": { "~app/*": ["./src/*"] } } }';

    expect(patchTsconfigPaths(partial, { ...PATHS, '~shared/*': ['./src/shared/*'] }))
      .toEqual({ kind: 'unparseable' });
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

  it('skips the bundler instruct when the vite config already quotes every alias (batch 10)', () => {
    // A prior init's surgery left this exact shape — re-running init must not
    // instruct the user to add what doctor's wiredness standard already accepts.
    const wired = state({
      hasViteConfig: true,
      viteConfig: {
        file: 'vite.config.ts',
        text: 'export default defineConfig({\n  resolve: { alias: { \'~app\': \'/src\' } },\n})\n',
      },
    });

    expect(instructs(aliasActions(wired, ARCH))).toHaveLength(0);

    // One alias quoted, one missing — the instruct still fires.
    const partial = aliasActions(wired, { ...ARCH, additionalAliases: { '~shared': 'src/shared' } });

    expect(instructs(partial).at(-1)).toContain('~shared');
  });

  it('skips the bundler instruct when a tsconfig-paths bridge plugin is wired (field #25)', () => {
    // The field repo: alias lived in tsconfig paths, vite-tsconfig-paths
    // bridged it — init still said "add resolve.alias" while doctor passed
    // untouched. Init must not demand a second wiring doctor never asks for.
    const bridged = state({
      hasViteConfig: true,
      viteConfig: {
        file: 'vite.config.ts',
        text: 'import tsconfigPaths from \'vite-tsconfig-paths\';\n'
          + 'export default defineConfig({ plugins: [tsconfigPaths()] })\n',
      },
      tsconfigs: {
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: PATHS } }),
        'tsconfig.app.json': null,
        'jsconfig.json': null,
      },
    });

    expect(instructs(aliasActions(bridged, ARCH))).toHaveLength(0);

    // Without the plugin, the vite side still needs wiring — and the
    // instruct itself names the bridge-plugin escape hatch.
    const unbridged = aliasActions(
      state({
        hasViteConfig: true,
        viteConfig: { file: 'vite.config.ts', text: 'export default defineConfig({})\n' },
        tsconfigs: {
          'tsconfig.json': JSON.stringify({ compilerOptions: { paths: PATHS } }),
          'tsconfig.app.json': null,
          'jsconfig.json': null,
        },
      }),
      ARCH,
    );

    const note = instructs(unbridged).at(-1);

    expect(note).toContain('resolve.alias');
    expect(note).toContain('vite-tsconfig-paths');
  });
});

describe('aliasActions · greenfield vite surgery fallback', () => {
  it('falls back to the bundler instruct when the vite config is not template-shaped', () => {
    const actions = aliasActions(
      state({
        hasViteConfig: true,
        viteConfig: { file: 'vite.config.ts', text: 'export default defineConfig(() => ({}))' },
      }),
      ARCH,
      true,
    );

    expect(actions.some(
      (action) => action.kind === 'write' && action.path === 'vite.config.ts',
    )).toBe(false);

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('resolve.alias'),
    )).toBe(true);
  });
});

describe('aliasActions · root-level source (sourceRoot ".")', () => {
  it('wires the vite alias to the project root', () => {
    const actions = aliasActions(
      state({
        hasViteConfig: true,
        viteConfig: {
          file: 'vite.config.ts',
          text: 'export default defineConfig({\n  plugins: [],\n})\n',
        },
      }),
      { ...ARCH, sourceRoot: '.' },
      true,
    );

    const vite = actions.find(
      (action): action is WriteAction => action.kind === 'write' && action.path === 'vite.config.ts',
    );

    expect(vite?.content).toContain('fileURLToPath(new URL(\'.\', import.meta.url))');
  });
});
