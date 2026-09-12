import { describe, expect, it } from 'vitest';

import {
  defineBlueprint,
  isLegacyBlueprintMigration,
  migrateLegacyBlueprint,
  migratedConfigSource,
  validateBlueprint,
} from '../config';
import type { Blueprint } from '../config';

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

  it('writes a dependency-free config module without retired fields', () => {
    const { blueprint } = migrateLegacyBlueprint(legacyBlueprint());
    const source = migratedConfigSource(blueprint);

    expect(source).toContain('export default {');
    expect(source).not.toContain('"module"');
    expect(source).toContain('"layout": "file"');
  });
});
