import { expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { DoctorCheck, ScanResult } from './types';
import { wiringCheck } from './wiring';

const checkOf = async (params: Parameters<typeof wiringCheck>[0]): Promise<DoctorCheck> =>
  (await wiringCheck(params)).check;

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    additionalAliases: {
      '~root': 'src',
      '~contexts': 'src/contexts',
      '~views': 'src/views',
    },
    layers: [
      { name: 'views', does: 'pages', layout: 'folder', entry: 'index' },
      {
        name: 'contexts',
        does: 'shared state',
        layout: 'folder',
        entry: 'index',
        allowedImporters: [{ layer: 'views', selfOnly: true }],
      },
      {
        name: 'stores', does: 'state', layout: 'folder', entry: 'index',
        allowedImporters: ['contexts'],
      },
      {
        name: 'services', does: 'io', layout: 'folder', entry: 'index',
        owns: [{ global: 'fetch' }],
      },
    ],
    layerFilesIgnore: 'src/**/*.gen.ts',
  },
  rules: { fixtureImports: 'error' },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

function loader(
  resolved: unknown | ((filePath: string) => unknown),
  throwOn?: 'load' | 'calculate',
) {
  return async (): Promise<unknown> => {
    if (throwOn === 'load') {
      throw new Error('unresolvable');
    }

    return {
      ESLint: class {
        async calculateConfigForFile(filePath: string): Promise<unknown> {
          if (throwOn === 'calculate') {
            throw new Error('broken config');
          }

          return typeof resolved === 'function' ? resolved(filePath) : resolved;
        }
      },
    };
  };
}

const run = (
  scanResult: ScanResult,
  resolved: unknown,
  projectEslint: { throwOn?: 'load' | 'calculate'; merged?: boolean } = {},
) =>
  checkOf({
    root: '/repo',
    blueprint,
    scanResult,
    wired: true,
    merged: projectEslint.merged ?? true,
    hasTypescript: true,
    load: loader(resolved, projectEslint.throwOn),
  });

it('keeps real rule loss red when another probe is ignored', async () => {
  const check = await run(scanOf('src/views/Home/index.vue'),
    (file: string) => file.includes('views') ? undefined : { rules: {} });

  expect(check.ok).toBe(false);
  expect(check.skipped).toBeUndefined();
  expect(check.detail).toContain('src/views/Home/index.vue');
  expect(check.detail).toContain('lost');
  expect(check.detail).not.toContain('views:');
});

it('treats a null config as missing rules, not an unavailable comparison', async () => {
  const check = await run(scanOf('src/views/Home/index.vue'), null);

  expect(check.ok).toBe(false);
  expect(check.skipped).toBeUndefined();
  expect(check.detail).toContain('views: no-restricted-imports lost');
});
