import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

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

it('rejects module directory destinations as non-files, not wrong topology', () => {
  const dir = root();
  const pending = obligation();

  pending.target.decisions[0]!.destinations = ['src/app'];

  const failures = verifyTransformationObligation({
    root: dir, obligation: pending, blueprint: blueprint(), state: state(dir), git: git(dir),
  }).failures;

  expect(failures).toContainEqual({ code: 'destination-not-file', subject: 'src/app' });
  expect(failures.map((entry) => entry.code)).not.toContain('route-destination-not-app');
  expect(codes({ root: dir })).toEqual([]);
});
