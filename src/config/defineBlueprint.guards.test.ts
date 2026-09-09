import { describe, expect, it } from 'vitest';

import { validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        {
          name: 'components',
          does: '可重用 UI',
          mustNot: ['import services'],
          layout: 'folder',
          entry: 'index',
        },
        { name: 'hooks', does: 'inject / 加工 state', layout: 'folder', entry: 'index' },
        {
          name: 'services',
          does: '網路原件',
          owns: ['axios', { global: 'fetch' }],
          layout: 'folder',
          entry: 'index',
        },
      ],
    },
  };
}

describe('validateBlueprint · a wrong type is not the same as a blank string', () => {
  it.each([
    [
      'name',
      (bp: Blueprint) => { bp.name = 42 as never; },
      /name must be a non-empty string/,
    ],
    [
      'alias',
      (bp: Blueprint) => { bp.architecture.alias = 42 as never; },
      /alias must be a non-empty string/,
    ],
    [
      'a layer name',
      (bp: Blueprint) => { bp.architecture.layers.push({ name: 7 as never, does: 'x' }); },
      /non-empty name/,
    ],
    [
      'a layer entry',
      (bp: Blueprint) => { bp.architecture.layers[0].entry = 1 as never; },
      /must be a non-empty string when set/,
    ],
    [
      'a module name',
      (bp: Blueprint) => {
        bp.architecture.modules = [{ name: 3 as never, does: 'checkout domain' }];
      },
      /module name must be a non-empty string/,
    ],
    [
      'an owned global name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: 5 as never }]; },
      /global with no name/,
    ],
    [
      'an owned package name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ package: 5 as never }]; },
      /package with no name/,
    ],
    [
      'an allowed importer layer',
      (bp: Blueprint) => {
        bp.architecture.layers[2].allowedImporters = [{ layer: 9 as never }];
      },
      /allowedImporters entry with no layer/,
    ],
    [
      'an emit.agents path',
      (bp: Blueprint) => { bp.emit = { agents: [{ target: 'windsurf', path: 4 as never }] }; },
      /has an empty path/,
    ],
  ])('names the field when %s is not a string', (_label, mutate, pattern) => {
    const config = base();

    mutate(config);
    expect(() => validateBlueprint(config)).toThrow(pattern);
  });

  it.each([
    [
      'a layer entry',
      (bp: Blueprint) => { bp.architecture.layers[0].entry = '   '; },
      /must be a non-empty string when set/,
    ],
    [
      'a module name',
      (bp: Blueprint) => {
        bp.architecture.modules = [{ name: '   ', does: 'checkout domain' }];
      },
      /module name must be a non-empty string/,
    ],
    [
      'an owned package string',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = ['   ']; },
      /empty package name/,
    ],
    [
      'an owned global name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: '   ' }]; },
      /global with no name/,
    ],
  ])('rejects whitespace-only %s', (_label, mutate, pattern) => {
    const config = base();

    mutate(config);
    expect(() => validateBlueprint(config)).toThrow(pattern);
  });

  it('survives a null layer and a null rule setting', () => {
    const nullLayer = base();

    nullLayer.architecture.layers.push(null as never);
    expect(() => validateBlueprint(nullLayer)).toThrow(/non-empty name/);

    const nullRule = base();

    nullRule.rules = { maxLines: null as never };
    expect(() => validateBlueprint(nullRule)).toThrow(/invalid tier/);
  });
});

describe('validateBlueprint · the guards that must NOT fire', () => {
  it('accepts a folder layer that declares only an entry override', () => {
    const config = base();

    config.architecture.layers[0] = {
      ...config.architecture.layers[0],
      layout: 'folder',
      entry: 'public',
    };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('accepts the spaces a hand-written {layer} placeholder carries', () => {
    const config = base();

    config.architecture.layerFiles = 'src/{ layer }/**/*.ts';

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('accepts spaced module and layer placeholders in module-first mode', () => {
    const config = base();

    config.architecture.modules = [{ name: 'checkout', does: 'checkout domain' }];
    config.architecture.layerFiles = 'src/{ module }/{ layer }/**/*.ts';

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('accepts an emit block that declares no agents', () => {
    const config = base();

    config.emit = { handbook: 'HB.md' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint · checks that see every entry, not just one', () => {
  it('rejects a bad alias target sitting beside a good one', () => {
    const config = base();

    config.architecture.additionalAliases = { '~shared': './src/shared', '~broken': '' };

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it('checks a layerFiles glob written as a bare string', () => {
    const config = base();

    config.architecture.layerFiles = 'src/**/*.ts';

    expect(() => validateBlueprint(config)).toThrow(/must include the "\{layer\}" placeholder/);
  });

  it('requires both module-first layerFiles placeholders', () => {
    const config = base();

    config.architecture.modules = [{ name: 'checkout', does: 'checkout domain' }];
    config.architecture.layerFiles = 'src/{layer}/**/*.ts';

    expect(() => validateBlueprint(config)).toThrow(/must include both/);
  });
});

describe('validateBlueprint · every rule the emitter manages', () => {
  it.each([
    'no-restricted-imports',
    'no-restricted-syntax',
    'no-restricted-globals',
    'max-lines',
    'blueprint/no-deep-watch',
    'blueprint/use-prefix',
  ])('refuses a lintOverrides entry for %s', (rule) => {
    const config = base();

    config.architecture.layers[0].lintOverrides = { [rule]: 'off' };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

  it('still allows an override the emitter does not write', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = { 'no-console': 'error' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});
