import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveProjectContext } from './context';
import { detect } from './detect';
import { toolchainForSource } from './scope';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function temp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-context-'));

  roots.push(root);

  return root;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

describe('resolveProjectContext', () => {
  it('keeps application, workspace toolchain, and containing repository roots distinct', () => {
    const workspace = temp();

    spawnSync('git', ['init'], { cwd: workspace });
    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');

    writeJson(path.join(workspace, 'package.json'), {
      devDependencies: { typescript: '5', 'typescript-eslint': '8' },
    });

    const app = path.join(workspace, 'apps', 'web');

    writeJson(path.join(app, 'package.json'), {
      scripts: { lint: 'pnpm lint:code', 'lint:code': 'eslint src' },
      dependencies: { vue: '3' },
    });

    writeJson(path.join(app, 'tsconfig.json'), { extends: '../../tsconfig.json' });

    expect(resolveProjectContext(app)).toMatchObject({
      applicationRoot: app,
      repositoryRoot: workspace,
      toolchainRoot: workspace,
      packageManager: 'pnpm',
      hasTypescript: true,
      localPackage: { root: app, dependencies: ['vue'] },
      toolchainPackage: {
        root: workspace,
        dependencies: ['typescript', 'typescript-eslint'],
      },
    });
  });

  it('does not inherit TypeScript into a standalone JavaScript application', () => {
    const parent = temp();

    writeJson(path.join(parent, 'package.json'), { devDependencies: { typescript: '5' } });
    const app = path.join(parent, 'standalone');

    writeJson(path.join(app, 'package.json'), { dependencies: { vue: '3' } });
    fs.writeFileSync(path.join(app, 'package-lock.json'), '{}');
    fs.mkdirSync(path.join(app, 'src'));
    fs.writeFileSync(path.join(app, 'src', 'main.js'), 'export {};\n');

    expect(resolveProjectContext(app)).toMatchObject({
      applicationRoot: app,
      toolchainRoot: app,
      packageManager: 'npm',
      hasTypescript: false,
    });
  });

  it('prefers the nearest package-manager boundary over an ancestor workspace', () => {
    const workspace = temp();

    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
    const app = path.join(workspace, 'apps', 'web');

    writeJson(path.join(app, 'package.json'), { name: 'web', scripts: { test: 'vitest' } });
    fs.writeFileSync(path.join(app, 'yarn.lock'), '');

    expect(resolveProjectContext(app)).toMatchObject({
      toolchainRoot: app,
      packageManager: 'yarn',
      localPackage: { name: 'web', scripts: { test: 'vitest' } },
    });
  });

  it('does not inspect package-manager files above the containing repository', () => {
    const outer = temp();

    fs.writeFileSync(path.join(outer, 'yarn.lock'), '');
    const repository = path.join(outer, 'application');

    fs.mkdirSync(repository);
    spawnSync('git', ['init'], { cwd: repository });
    writeJson(path.join(repository, 'package.json'), { name: 'application' });

    expect(resolveProjectContext(repository)).toMatchObject({
      applicationRoot: repository,
      repositoryRoot: repository,
      toolchainRoot: repository,
      packageManager: 'npm',
    });
  });
});

describe('resolveProjectContext · inheritance boundaries', () => {
  it('inherits a workspace toolchain through a package-only application boundary', () => {
    const workspace = temp();

    writeJson(path.join(workspace, 'package.json'), {
      workspaces: ['apps/*'],
      devDependencies: { typescript: '5' },
    });

    writeJson(path.join(workspace, 'tsconfig.json'), { include: ['apps/*/src'] });
    fs.writeFileSync(path.join(workspace, 'vite.config.ts'), 'export default {}\n');

    const app = path.join(workspace, 'apps', 'web');

    writeJson(path.join(app, 'package.json'), { dependencies: { react: '19' } });
    fs.mkdirSync(path.join(app, 'src'), { recursive: true });
    fs.writeFileSync(path.join(app, 'src', 'main.tsx'), 'export const App = () => null;\n');

    expect(resolveProjectContext(app)).toMatchObject({
      toolchainRoot: workspace,
      hasTypescript: true,
    });

    expect(toolchainForSource(app)).toMatchObject({
      root: '../..',
      tsconfigs: { '../../tsconfig.json': expect.any(String) },
      viteConfig: { file: '../../vite.config.ts' },
    });

    expect(toolchainForSource(workspace, 'apps/web')).toMatchObject({
      root: 'apps/web',
    });
  });

  it('requires local TypeScript evidence before inheriting the workspace dependency', () => {
    const workspace = temp();

    writeJson(path.join(workspace, 'package.json'), {
      workspaces: ['apps/*'],
      devDependencies: { typescript: '5' },
    });

    const app = path.join(workspace, 'apps', 'plain-js');

    writeJson(path.join(app, 'package.json'), { dependencies: { react: '19' } });
    writeJson(path.join(workspace, 'tsconfig.json'), { include: ['apps/*/src'] });
    fs.mkdirSync(path.join(app, 'src'));
    fs.writeFileSync(path.join(app, 'src', 'main.js'), 'export {};\n');
    fs.writeFileSync(path.join(app, 'src', 'main.ts.map'), '{}\n');

    for (const ignored of ['.git', 'node_modules', 'dist', 'build', 'coverage']) {
      fs.mkdirSync(path.join(app, 'src', ignored), { recursive: true });
      fs.writeFileSync(path.join(app, 'src', ignored, 'generated.ts'), 'export {};\n');
    }

    expect(resolveProjectContext(app)).toMatchObject({
      toolchainRoot: workspace,
      hasTypescript: false,
    });
  });

  it('treats an unreadable application tree as having no TypeScript source evidence', () => {
    const workspace = temp();

    writeJson(path.join(workspace, 'package.json'), {
      workspaces: ['apps/*'],
      devDependencies: { typescript: '5' },
    });

    const app = path.join(workspace, 'apps', 'unreadable');

    writeJson(path.join(app, 'package.json'), {});

    const readDir = vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
      throw new Error('unreadable');
    });

    expect(resolveProjectContext(app).hasTypescript).toBe(false);
    readDir.mockRestore();
  });

  it('keeps canonical identities stable when unrelated workspace files are added', () => {
    const workspace = temp();

    spawnSync('git', ['init'], { cwd: workspace });
    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
    writeJson(path.join(workspace, 'package.json'), { devDependencies: { typescript: '5' } });

    const app = path.join(workspace, 'apps', 'web');

    writeJson(path.join(app, 'package.json'), { dependencies: { vue: '3' } });
    writeJson(path.join(app, 'tsconfig.json'), {});

    const before = resolveProjectContext(app);

    fs.mkdirSync(path.join(workspace, 'packages', 'unrelated'), { recursive: true });

    writeJson(path.join(workspace, 'packages', 'unrelated', 'package.json'), {
      dependencies: { react: '19' },
    });

    const after = resolveProjectContext(app);
    const state = detect(app);

    expect(after).toEqual(before);

    expect(state).toMatchObject({
      applicationRoot: before.applicationRoot,
      repositoryRoot: before.repositoryRoot,
      toolchainRoot: before.toolchainRoot,
      packageManager: before.packageManager,
      hasTypescript: before.hasTypescript,
    });
  });
});

describe('resolveProjectContext · package metadata', () => {
  it('treats malformed and non-object package metadata as empty', () => {
    const malformed = temp();
    const array = temp();
    const nullable = temp();

    fs.writeFileSync(path.join(malformed, 'package.json'), '{ nope');
    fs.writeFileSync(path.join(array, 'package.json'), '[]');
    fs.writeFileSync(path.join(nullable, 'package.json'), 'null');

    expect(resolveProjectContext(malformed).localPackage).toMatchObject({
      scripts: {},
      dependencies: [],
    });

    expect(resolveProjectContext(array).localPackage).toMatchObject({
      scripts: {},
      dependencies: [],
    });

    expect(resolveProjectContext(nullable).localPackage).toMatchObject({
      scripts: {},
      dependencies: [],
    });
  });

  it('keeps only string-valued package scripts', () => {
    const root = temp();

    writeJson(path.join(root, 'package.json'), {
      scripts: { lint: 'eslint src', invalid: 42, missing: null },
    });

    expect(resolveProjectContext(root).localPackage.scripts).toEqual({
      lint: 'eslint src',
    });
  });

  it('rejects primitive dependency and script containers', () => {
    const primitive = temp();
    const arrays = temp();

    writeJson(path.join(primitive, 'package.json'), {
      scripts: 'eslint src',
      dependencies: 'typescript',
      devDependencies: null,
    });

    writeJson(path.join(arrays, 'package.json'), {
      scripts: ['eslint src'],
      dependencies: ['typescript'],
    });

    expect(resolveProjectContext(primitive).localPackage).toMatchObject({
      scripts: {},
      dependencies: [],
    });

    const arrayMetadata = resolveProjectContext(arrays).localPackage;

    expect(arrayMetadata.scripts).toEqual({});
    expect(arrayMetadata.dependencies).toEqual([]);
  });

  it.each([
    ['array', ['apps/*']],
    ['object', { packages: ['apps/*'] }],
  ])('recognizes package.json %s workspace ownership', (_label, workspaces) => {
    const workspace = temp();

    writeJson(path.join(workspace, 'package.json'), {
      workspaces,
      devDependencies: { typescript: '5' },
    });

    const app = path.join(workspace, 'apps', 'web');

    writeJson(path.join(app, 'package.json'), { dependencies: { react: '19' } });
    writeJson(path.join(app, 'tsconfig.json'), {});

    expect(resolveProjectContext(app)).toMatchObject({
      toolchainRoot: workspace,
      hasTypescript: true,
    });
  });
});
