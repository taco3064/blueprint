import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  isLegacyBlueprintMigration,
  migrateLegacyBlueprint,
  migrateLegacyConfigSource,
  resolveArchitecture,
} from '../config';
import type { Blueprint } from '../config';
import { defineBlueprint, validateBlueprint } from '../operational-contract';
import { reactPreset } from '../presets';
import { versionedModuleUrl } from './load';

function legacyBlueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: 'routes' },
        { name: 'components', does: 'UI', module: { layout: 'flat', entry: 'component' } },
      ],
      module: { layout: 'folder', entry: 'index', private: ['hooks'] },
    },
  } as Blueprint;
}

describe('Blueprint 3.2 config migration', () => {
  it('moves shared and overridden module shapes onto their 4.0 layers', () => {
    const result = migrateLegacyBlueprint(legacyBlueprint());

    expect(result.migrated).toBe(true);

    expect(result.blueprint.architecture).not.toHaveProperty('module');

    expect(result.blueprint.architecture.layers).toEqual([
      { name: 'pages', does: 'routes', layout: 'folder', entry: 'index' },
      { name: 'components', does: 'UI', layout: 'file', entry: 'component' },
    ]);
  });

  it('fills 4.0 defaults when only layer-level 3.2 overrides exist', () => {
    const source = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'pages', does: 'routes', module: { layout: 'folder' } },
          { name: 'components', does: 'UI', module: { entry: 'component' } },
          { name: 'hooks', does: 'state', module: {} },
          { name: 'services', does: 'I/O' },
        ],
      },
    } as Blueprint;

    expect(migrateLegacyBlueprint(source).blueprint.architecture.layers).toEqual([
      { name: 'pages', does: 'routes', layout: 'folder', entry: 'index' },
      { name: 'components', does: 'UI', layout: 'file', entry: 'component' },
      { name: 'hooks', does: 'state', layout: 'file', entry: 'index' },
      { name: 'services', does: 'I/O', layout: 'file', entry: 'index' },
    ]);
  });

  it('leaves a current 4.0 blueprint untouched', () => {
    const current: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'pages', does: 'routes', layout: 'folder', entry: 'page' }],
      },
    };

    expect(migrateLegacyBlueprint(current)).toEqual({ blueprint: current, migrated: false });
  });

  it('does not migrate a malformed config that already uses 4.0 shape fields', () => {
    const withModules = legacyBlueprint();
    const withLayerShape = legacyBlueprint();

    withModules.architecture.modules = [{ name: 'auth', does: 'authentication' }];
    withLayerShape.architecture.layers[0].layout = 'file';

    for (const config of [withModules, withLayerShape]) {
      expect(migrateLegacyBlueprint(config).migrated).toBe(false);
      expect(() => validateBlueprint(config)).toThrow(/architecture\.module/);
    }
  });

  it.each([
    [{ layuot: 'folder' }, /Unknown key "layuot" in architecture\.module/],
    [{ private: 'hooks' }, /architecture\.module\.private must be an array/],
    [null, /architecture\.module must be an object/],
    ['flat', /architecture\.module must be an object/],
    [[], /architecture\.module must be an object/],
  ])('rejects an invalid 3.2 architecture.module instead of dropping it', (module, message) => {
    const config = legacyBlueprint();

    (config.architecture as unknown as { module: unknown }).module = module;

    expect(() => defineBlueprint(config)).toThrow(message as RegExp);
  });

  it('rejects unknown fields in a 3.2 layer module override', () => {
    const config = legacyBlueprint();

    (config.architecture.layers[1] as unknown as { module: unknown }).module = {
      layout: 'flat', private: [],
    };

    expect(() => defineBlueprint(config)).toThrow(/Unknown key "private".*module override/);
  });

  it('lets a real 3.2 defineBlueprint call reach init as a marked migration', () => {
    const migrated = defineBlueprint(legacyBlueprint());

    expect(isLegacyBlueprintMigration(migrated)).toBe(true);
    expect(migrated.architecture).not.toHaveProperty('module');
  });
});

describe('Blueprint 3.2 config source migration', () => {
  const original = [
    'import { defineBlueprint, reactPreset } from \'@kekkai/blueprint\';',
    '',
    '/** The preset is spread in unchanged; only the architecture is replaced. */',
    'export default defineBlueprint({',
    '  ...reactPreset({ name: \'sky\' }),',
    '  architecture: {',
    '    alias: \'~app\',',
    '    layers: [',
    '      { name: \'pages\', does: \'Mounts the shell.\' },',
    '      {',
    '        name: \'components\',',
    '        does: \'Presentational only.\',',
    '        // components stay flat files',
    '        module: { layout: \'flat\', entry: \'component\' },',
    '      },',
    '      { name: \'hooks\', does: \'Adapts state.\' },',
    '    ],',
    '    module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] },',
    '  },',
    '});',
    '',
  ].join('\n');

  let directory: string;

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-legacy-source-'));

    const stub = path.join(directory, 'node_modules/@kekkai/blueprint');
    const preset = JSON.stringify(reactPreset());

    fs.mkdirSync(stub, { recursive: true });
    fs.writeFileSync(path.join(stub, 'package.json'), '{"type":"module","exports":"./index.mjs"}');

    fs.writeFileSync(path.join(stub, 'index.mjs'), [
      'export const defineBlueprint = (config) => config;',
      `export const reactPreset = (options) => ({ ...${preset}, ...options });`,
      '',
    ].join('\n'));
  });

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  async function evaluate(name: string, source: string): Promise<Blueprint> {
    const file = path.join(directory, name);

    fs.writeFileSync(file, source);

    return (await import(versionedModuleUrl(file))).default as Blueprint;
  }

  it('keeps both calls and every comment and drops every retired key', async () => {
    const expected = migrateLegacyBlueprint(await evaluate('a.mjs', original)).blueprint;
    const result = migrateLegacyConfigSource(original, expected);
    const source = result.kind === 'rewritten' ? result.source : '';

    expect(source).toContain('export default defineBlueprint({');
    expect(source).toContain('...reactPreset({ name: \'sky\' }),');

    for (const comment of original.match(/\/\*\*.*\*\/|\/\/.*/g)!) {
      expect(source).toContain(comment);
    }

    expect(source).not.toMatch(/\bmodule\s*:/);
  });

  it('runs and resolves to the same architecture as the in-memory migration', async () => {
    const expected = migrateLegacyBlueprint(await evaluate('b.mjs', original)).blueprint;
    const result = migrateLegacyConfigSource(original, expected);
    const current = await evaluate('c.mjs', result.kind === 'rewritten' ? result.source : '');

    expect(migrateLegacyBlueprint(current).migrated).toBe(false);
    expect(validateBlueprint(current)).toBe(current);
    expect(current.name).toBe('sky');

    const resolved = (architecture: Blueprint['architecture']) => JSON.parse(JSON.stringify(
      resolveArchitecture(architecture),
      (key, value) => key === 'definition' ? undefined : value,
    ));

    expect(resolved(current.architecture)).toEqual(resolved(expected.architecture));
  });
});
