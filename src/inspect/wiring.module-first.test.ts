import { describe, expect, it } from 'vitest';
import path from 'node:path';

import type { Blueprint } from '../config';
import { expectedContainerStructural, expectedStructural, wiringCheck } from './wiring';

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    additionalAliases: { '~shop': 'src/shop' },
    layerFilesIgnore: 'src/**/*.gen.ts',
    modules: [
      { name: 'auth', does: 'authentication' },
      { name: 'shop', does: 'commerce', dependsOn: ['auth'] },
    ],
    layers: [
      { name: 'views', does: 'pages', layout: 'folder', entry: 'index' },
      {
        name: 'contexts',
        does: 'shared state',
        layout: 'folder',
        entry: 'index',
        owns: [{ global: 'fetch' }],
        allowedImporters: [{ layer: 'views', selfOnly: true }],
      },
    ],
  },
};

// eslint-disable-next-line max-lines-per-function
describe('wiringCheck · module-first topology', () => {
  it('never uses an ignored module-container file as a probe', async () => {
    const probed: string[] = [];

    const configured: Blueprint = {
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        layerFilesIgnore: ['src/auth/index.ts', 'src/never.ts'],
      },
    };

    await wiringCheck({
      root: '/repo',
      blueprint: configured,
      scanResult: {
        topDirs: ['auth'],
        files: [{
          path: 'src/auth/index.ts',
          segments: ['auth', 'index.ts'],
          imports: [],
        }, {
          path: 'src/shop/index.ts',
          segments: ['shop', 'index.ts'],
          imports: [],
        }],
      },
      wired: true,
      merged: true,
      hasTypescript: true,
      load: async () => ({
        ESLint: class {
          calculateConfigForFile(filePath: string): unknown {
            probed.push(filePath.split(path.sep).join('/'));

            return { rules: {} };
          }
        },
      }),
    });

    expect(probed.some((file) => file.endsWith('/auth/index.ts'))).toBe(false);
    expect(probed.some((file) => file.endsWith('/shop/index.ts'))).toBe(true);
  });

  it('scopes aliases and probe identity to each outer module', async () => {
    const expected = expectedStructural(blueprint, 'views', 'auth');

    expect(expected.selectors.size).toBeGreaterThan(0);
    expect([...expected.selectors].some((selector) => selector.includes('~shop'))).toBe(false);

    const result = await wiringCheck({
      root: '/repo',
      blueprint,
      scanResult: {
        topDirs: ['auth'],
        files: [{
          path: 'src/auth/views/Home/index.vue',
          segments: ['auth', 'views', 'Home', 'index.vue'],
          imports: [],
        }],
      },
      wired: true,
      merged: true,
      hasTypescript: true,
      load: async () => ({
        ESLint: class {
          calculateConfigForFile(): unknown {
            return { rules: {} };
          }
        },
      }),
    });

    expect(result.check.ok).toBe(false);
    expect(result.check.detail).toContain('auth/views:');
    expect(result.check.detail).toContain('shop/views:');
    expect(result.check.detail).toContain('auth:');
    expect(result.check.detail).toContain('shop:');
  });

  it('describes the structural rules at a module-root container', () => {
    const expected = expectedContainerStructural(blueprint, 'auth');

    expect([...expected.groups].some((group) => group.includes('~app/auth/views/*/**')))
      .toBe(true);

    expect(expected.selectors).toEqual(new Set());
    expect(expected.globals).toEqual(new Set(['fetch']));
  });

  it('keeps folder-entry and fixture restrictions scoped to applicable targets', () => {
    const configured: Blueprint = {
      ...blueprint,
      rules: { fixtureImports: 'error' },
      architecture: {
        ...blueprint.architecture,
        layers: blueprint.architecture.layers.map((layer) =>
          layer.name === 'contexts' ? { ...layer, layout: 'file' as const } : layer),
      },
    };

    const layerRoot = expectedStructural(configured, 'views');
    const moduleLayer = expectedStructural(configured, 'views', 'auth');
    const container = expectedContainerStructural(configured, 'auth');

    expect([...layerRoot.groups].some((group) => group.includes('~app/views/*/**'))).toBe(false);

    expect([...moduleLayer.groups].some((group) => group.includes('~app/auth/views/*/**')))
      .toBe(true);

    expect([...container.groups].some((group) => group.includes('~app/auth/contexts/*/**')))
      .toBe(false);

    expect([...container.groups]).toContain(JSON.stringify([
      '~app/fixtures',
      '~app/fixtures/**',
    ]));

    expect([...container.groups].some((group) => group.includes('Stryker was here'))).toBe(false);
  });

  it('models module reachability in layer and container wiring expectations', () => {
    const layer = expectedStructural(blueprint, 'views', 'shop');
    const container = expectedContainerStructural(blueprint, 'auth');

    expect([...layer.groups].some((group) => group.includes('~app/auth/contexts'))).toBe(true);

    expect(layer.paths).toEqual(new Set(['~app/shop', '~shop', '~app/auth']));

    expect([...layer.selectors].some((selector) => selector.includes('auth')))
      .toBe(true);

    expect([...container.groups].some((group) => group.includes('~app/shop/**'))).toBe(true);
  });
});

describe('wiringCheck · module-first resolved paths', () => {
  it('recognizes surviving module graph paths in the resolved config', async () => {
    const expected = blueprint.architecture.modules!.flatMap((module) => [
      expectedContainerStructural(blueprint, module.name),
      ...blueprint.architecture.layers.map((layer) =>
        expectedStructural(blueprint, layer.name, module.name)),
    ]);

    const groups = new Set(expected.flatMap((entry) => [...entry.groups]));
    const paths = new Set(expected.flatMap((entry) => [...entry.paths]));
    const selectors = new Set(expected.flatMap((entry) => [...entry.selectors]));
    const globals = new Set(expected.flatMap((entry) => [...entry.globals]));
    let includePaths = true;

    const params: Parameters<typeof wiringCheck>[0] = {
      root: '/repo',
      blueprint,
      scanResult: { topDirs: [], files: [] },
      wired: true,
      merged: true,
      hasTypescript: true,
      load: async () => ({
        ESLint: class {
          calculateConfigForFile(): unknown {
            return {
              rules: {
                'blueprint/relative-escape': 'error',
                'blueprint/import-boundary': ['error', { architecture: blueprint.architecture }],
                'no-restricted-imports': [2, {
                  patterns: [...groups].map((group) => ({
                    group: JSON.parse(group) as string[],
                  })),
                  ...(includePaths ? { paths: [...paths].map((name) => ({ name })) } : {}),
                }],
                'no-restricted-syntax': [2, ...selectors],
                'no-restricted-globals': [2, ...globals],
              },
            };
          }
        },
      }),
    };

    const result = await wiringCheck(params);

    expect(result.check.ok).toBe(true);

    includePaths = false;

    const missing = await wiringCheck(params);

    expect(missing.check.ok).toBe(false);
    expect(missing.check.detail).toContain(`lost ${paths.size} structural path(s)`);
  });
});
