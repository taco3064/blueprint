import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { makeRepo, rm, wiredEslintConfig } from '../conformance';
import { emitLint } from '../emit/lint';
import type { ProjectState } from '../project';
import { assessLintIntegration } from './adoption';
import type { LiveLintEvidence } from './lint-runtime';
import type { ScanResult } from './types';

vi.mock('./lint-runtime', () => ({
  runLiveLint: (): LiveLintEvidence => ({
    status: 'passed',
    command: 'eslint src/inspect/adoption.ts',
    errors: 0,
    warnings: 0,
  }),
}));

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'services', does: 'I/O', layout: 'folder', allowedImporters: ['components'] },
    ],
  },
};

const scanResult: ScanResult = {
  topDirs: ['components', 'services'],
  files: [{
    path: 'src/components/Card/index.js',
    segments: ['components', 'Card', 'index.js'],
    imports: [],
  }],
};

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  const root = process.cwd();

  return {
    root,
    applicationRoot: root,
    toolchainRoot: root,
    localPackage: { root, scripts: { lint: 'eslint .' }, dependencies: ['eslint'] },
    toolchainPackage: { root, scripts: {}, dependencies: ['eslint'] },
    framework: 'react',
    packageManager: 'npm',
    hasConfig: true,
    hasEslintConfig: true,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    wiredEslintConfig: true,
    hasViteConfig: false,
    hasTypescript: false,
    tsconfigs: {},
    existingSrcDirs: ['components', 'services'],
    missingDeps: [],
    dependencies: ['eslint'],
    ...overrides,
  };
}

function loader(entries = emitLint(blueprint)) {
  return async (): Promise<unknown> => ({
    ESLint: class {
      private readonly eslint = new ESLint({
        cwd: process.cwd(),
        overrideConfigFile: true,
        overrideConfig: entries,
      });

      async calculateConfigForFile(file: string): Promise<unknown> {
        return this.eslint.calculateConfigForFile(path.resolve(file));
      }
    },
  });
}

function lint(status: LiveLintEvidence['status']) {
  return vi.fn((): LiveLintEvidence => ({
    status,
    command: 'eslint .',
    errors: status === 'failed' ? 1 : 0,
    warnings: 0,
  }));
}

describe('assessLintIntegration', () => {
  it('distinguishes absent wiring from reference-only flat and legacy configs', async () => {
    await expect(assessLintIntegration(state({
      hasEslintConfig: false,
      wiredEslintConfig: false,
    }), blueprint, { scanResult })).resolves.toBe('unverified');

    await expect(assessLintIntegration(state({
      wiredEslintConfig: false,
    }), blueprint, { scanResult })).resolves.toBe('reference-only');

    await expect(assessLintIntegration(state({
      hasEslintConfig: false,
      wiredEslintConfig: false,
      legacyEslintConfig: '.eslintrc.cjs',
    }), blueprint, { scanResult })).resolves.toBe('reference-only');
  });

  it('does not probe or run lint without a reachable project ESLint entrypoint', async () => {
    const load = vi.fn(loader());
    const runLint = lint('passed');

    const result = await assessLintIntegration(state({
      localPackage: {
        root: process.cwd(),
        scripts: {},
        dependencies: ['eslint'],
      },
    }), blueprint, { scanResult, load, lint: runLint });

    expect(result).toBe('unverified');
    expect(load).not.toHaveBeenCalled();
    expect(runLint).not.toHaveBeenCalled();
  });

  it('does not verify evidence measured before the pending dependency install', async () => {
    const load = vi.fn(loader());
    const runLint = lint('passed');

    const result = await assessLintIntegration(
      state({ missingDeps: ['@kekkai/blueprint'] }),
      blueprint,
      { scanResult, load, lint: runLint },
    );

    expect(result).toBe('unverified');
    expect(load).not.toHaveBeenCalled();
    expect(runLint).not.toHaveBeenCalled();
  });

  it('requires live merge-survival evidence before running project lint', async () => {
    const runLint = lint('passed');

    await expect(assessLintIntegration(
      state(),
      blueprint,
      { scanResult, load: loader([]), lint: runLint },
    )).resolves.toBe('unverified');

    expect(runLint).not.toHaveBeenCalled();
  });

  it('does not convert unavailable merge evidence into verification', async () => {
    const load = async (): Promise<never> => {
      throw new Error('config unavailable');
    };

    const runLint = lint('passed');

    await expect(assessLintIntegration(
      state(),
      blueprint,
      { scanResult, load, lint: runLint },
    )).resolves.toBe('unverified');

    expect(runLint).not.toHaveBeenCalled();
  });

  it.each(['failed', 'unverified'] as const)(
    'keeps live lint status %s unverified after emitted rules survive',
    async (status) => {
      await expect(assessLintIntegration(
        state(),
        blueprint,
        { scanResult, load: loader(), lint: lint(status) },
      )).resolves.toBe('unverified');
    },
  );

  it('verifies only when actual emitted rules survive and live project lint passes', async () => {
    const runLint = lint('passed');

    await expect(assessLintIntegration(
      state(),
      blueprint,
      { scanResult, load: loader(), lint: runLint },
    )).resolves.toBe('verified');

    expect(runLint).toHaveBeenCalledExactlyOnceWith(
      process.cwd(), ['eslint'], expect.objectContaining({ reachable: true }),
    );
  });
});

describe('assessLintIntegration defaults', () => {
  it('uses project loading and live lint when effects are not overridden', async () => {
    const root = makeRepo({
      packageJson: { scripts: { lint: 'eslint .' }, devDependencies: { eslint: '^9' } },
      files: { 'eslint.config.mjs': wiredEslintConfig(blueprint) },
    });

    fs.mkdirSync(path.join(root, 'node_modules'));

    fs.symlinkSync(
      path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')),
      path.join(root, 'node_modules/eslint'),
      'junction',
    );

    dirs.push(root);

    const currentState = state({
      root,
      applicationRoot: root,
      toolchainRoot: root,
      localPackage: {
        root,
        scripts: { lint: 'eslint .' },
        dependencies: ['eslint'],
      },
      toolchainPackage: { root, scripts: {}, dependencies: ['eslint'] },
    });

    const result = await assessLintIntegration(currentState, blueprint, { scanResult });

    expect(result).toBe('verified');
  });
});

describe('assessLintIntegration dependency evidence', () => {
  it('supplies both dependency inventories without duplicates to live lint', async () => {
    const root = process.cwd();
    const runLint = lint('passed');

    const current = state({
      localPackage: {
        root, scripts: { lint: 'eslint .' }, dependencies: ['eslint', 'application-only'],
      },
      toolchainPackage: { root, scripts: {}, dependencies: ['eslint', 'toolchain-only'] },
    });

    expect(await assessLintIntegration(current, blueprint, {
      scanResult, load: loader(), lint: runLint,
    })).toBe('verified');

    expect(runLint).toHaveBeenCalledExactlyOnceWith(
      root, ['eslint', 'application-only', 'toolchain-only'],
      expect.objectContaining({ reachable: true }),
    );
  });
});
