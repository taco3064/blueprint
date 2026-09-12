import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reactPreset } from '../presets';
import type { Blueprint } from '../config';
import { resolveRepositoryBlueprints } from './blueprints';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-repository-blueprints-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function config(relative: string): string {
  const file = path.join(root, relative, 'blueprint.config.mjs');

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export default {};\n');

  return file;
}

function legacyBlueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      module: { layout: 'folder', entry: 'index' },
      layers: [
        { name: 'pages', does: 'routes' },
        { name: 'components', does: 'UI', module: { layout: 'flat' } },
      ],
    },
  } as Blueprint;
}

describe('resolveRepositoryBlueprints', () => {
  it('returns no configs when the repository root cannot be read', async () => {
    expect(await resolveRepositoryBlueprints(path.join(root, 'missing'))).toEqual([]);
  });

  it('loads every application config deterministically and derives topology from config',
    async () => {
      const web = config('apps/web');

      config('apps/admin');

      const loadConfig = vi.fn(async (file: string) => ({
        ...reactPreset(),
        architecture: file === web
          ? reactPreset().architecture
          : {
              ...reactPreset().architecture,
              modules: [{ name: 'auth', does: 'authentication' }],
            },
      }));

      const result = await resolveRepositoryBlueprints(root, { loadConfig });

      expect(result.map(({ applicationRoot, topology }) => ({
        applicationRoot: path.relative(root, applicationRoot), topology,
      }))).toEqual([
        { applicationRoot: path.join('apps', 'admin'), topology: 'module-first' },
        { applicationRoot: path.join('apps', 'web'), topology: 'layer-first' },
      ]);

      expect(loadConfig).toHaveBeenCalledTimes(2);
    });

  it('sorts configs even when the filesystem returns root entries in reverse order', async () => {
    config('apps-a');
    config('apps-z');

    const entries = fs.readdirSync(root, { withFileTypes: true });

    vi.spyOn(fs, 'readdirSync').mockReturnValueOnce([...entries].reverse() as never);

    const result = await resolveRepositoryBlueprints(root, {
      loadConfig: async () => reactPreset(),
    });

    expect(result.map((entry) => path.basename(entry.applicationRoot))).toEqual([
      'apps-a', 'apps-z',
    ]);
  });

  it.each(['.git', 'node_modules'])(
    'ignores config-shaped files under %s', async (directory) => {
      config(directory);

      expect(await resolveRepositoryBlueprints(root, {
        loadConfig: vi.fn(),
      })).toEqual([]);
    },
  );

  it.each(['.next', '.nuxt', 'build', 'coverage', 'dist'])(
    'traverses %s as an ordinary ancestor when it contains a nested application',
    async (directory) => {
      config(path.join('apps', directory, 'admin'));

      fs.writeFileSync(
        path.join(root, 'apps', directory, 'admin', 'package.json'),
        '{"name":"fixture"}\n',
      );

      const result = await resolveRepositoryBlueprints(root, {
        loadConfig: async () => reactPreset(),
      });

      expect(result.map((entry) => path.relative(root, entry.applicationRoot))).toEqual([
        path.join('apps', directory, 'admin'),
      ]);
    },
  );

  it.each(['directory', 'file'] as const)(
    'does not cross a nested Git repository whose .git marker is a %s', async (marker) => {
      config('apps/outer');
      config('vendor/nested');

      const gitMarker = path.join(root, 'vendor', 'nested', '.git');

      if (marker === 'directory') {
        fs.mkdirSync(gitMarker);
      } else {
        fs.writeFileSync(gitMarker, 'gitdir: ../../.git/modules/nested\n');
      }

      const loadConfig = vi.fn(async () => reactPreset());
      const result = await resolveRepositoryBlueprints(root, { loadConfig });

      expect(result.map((entry) => path.relative(root, entry.applicationRoot))).toEqual([
        path.join('apps', 'outer'),
      ]);

      expect(loadConfig).toHaveBeenCalledTimes(1);
    },
  );

  it('fails on an invalid config instead of treating the application as unmanaged', async () => {
    config('apps/web');

    await expect(resolveRepositoryBlueprints(root, {
      loadConfig: async () => ({ ...reactPreset(), architecture: { alias: '~app', layers: [] } }),
    })).rejects.toThrow(/blueprint\.config\.mjs.*architecture\.layers/);
  });

  it('fails when a config module has no default export', async () => {
    config('apps/web');

    await expect(resolveRepositoryBlueprints(root, {
      loadConfig: async () => undefined as never,
    })).rejects.toThrow('missing default export');
  });
});

describe('resolveRepositoryBlueprints · legacy topology authority', () => {
  it('normalizes pure 3.2 siblings only when init requests migration', async () => {
    config('apps/web');

    await expect(resolveRepositoryBlueprints(root, {
      loadConfig: async () => legacyBlueprint(),
    })).rejects.toThrow(/architecture\.module is retired/);

    const [legacy] = await resolveRepositoryBlueprints(root, {
      loadConfig: async () => legacyBlueprint(),
      migrateLegacyConfig: true,
    });

    expect(legacy.topology).toBe('layer-first');
    expect(legacy.architecture).not.toHaveProperty('module');
  });
});
