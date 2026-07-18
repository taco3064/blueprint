import { describe, expect, it } from 'vitest';

import { defineBlueprint, validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: '可重用 UI', mustNot: ['import services'] },
        { name: 'hooks', does: 'inject / 加工 state' },
        { name: 'services', does: '網路原件', owns: ['axios', { global: 'fetch' }] },
      ],
      flow: 'one-way',
      module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
    },
  };
}

describe('defineBlueprint', () => {
  it('returns the same config object when valid', () => {
    const config = base();

    expect(defineBlueprint(config)).toBe(config);
  });

  it('accepts extraEdges as objects with options', () => {
    const config = base();

    config.architecture.extraEdges = [
      { edge: 'components⇢services', selfOnly: true, description: 'net only' },
    ];

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts →, ->, and ⇢ as edge separators', () => {
    for (const edge of ['hooks→services', 'hooks->services', 'hooks⇢services']) {
      const config = base();

      config.architecture.extraEdges = [edge];

      expect(() => validateBlueprint(config)).not.toThrow();
    }
  });

  it('accepts valid additionalAliases and layerFiles', () => {
    const config = base();

    config.architecture.additionalAliases = { '~shared': './src/shared' };
    config.architecture.layerFiles = 'src/{layer}/**/*.ts';

    expect(() => defineBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint', () => {
  it('rejects a blank name when provided', () => {
    const config = base();

    config.name = '   ';

    expect(() => validateBlueprint(config)).toThrow(/name must be a non-empty string/);
  });

  it('rejects a missing architecture', () => {
    const config = base();

    config.architecture = undefined as never;

    expect(() => validateBlueprint(config)).toThrow(/must be an array/);
  });

  it('rejects a missing alias', () => {
    const config = base();

    config.architecture.alias = '  ';

    expect(() => validateBlueprint(config)).toThrow(/alias must be a non-empty string/);
  });

  it('rejects empty layers', () => {
    const config = base();

    config.architecture.layers = [];

    expect(() => validateBlueprint(config)).toThrow(/must not be empty/);
  });

  it('rejects duplicate layer names', () => {
    const config = base();

    config.architecture.layers.push({ name: 'hooks', does: 'dup' });

    expect(() => validateBlueprint(config)).toThrow(/Duplicate layer name/);
  });

  it('rejects a layer with a blank name', () => {
    const config = base();

    config.architecture.layers.push({ name: '  ', does: 'blank' });

    expect(() => validateBlueprint(config)).toThrow(/non-empty name/);
  });

  it('rejects an owned empty package string', () => {
    const config = base();

    config.architecture.layers[2].owns = [''];

    expect(() => validateBlueprint(config)).toThrow(/empty package name/);
  });

  it('rejects an owned global with no name', () => {
    const config = base();

    config.architecture.layers[2].owns = [{ global: '' }];

    expect(() => validateBlueprint(config)).toThrow(/global with no name/);
  });

  it('rejects an owned package with no name', () => {
    const config = base();

    config.architecture.layers[2].owns = [{ package: '  ', imports: ['x'] }];

    expect(() => validateBlueprint(config)).toThrow(/package with no name/);
  });

  it('rejects a missing module entry', () => {
    const config = base();

    config.architecture.module.entry = '';

    expect(() => validateBlueprint(config)).toThrow(/module\.entry/);
  });

  it('rejects a non-array module.private', () => {
    const config = base();

    config.architecture.module.private = 'nope' as never;

    expect(() => validateBlueprint(config)).toThrow(/module\.private/);
  });

  it('rejects invalid additionalAliases', () => {
    const config = base();

    config.architecture.additionalAliases = { '~x': '' };

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it('rejects a layerFiles glob without the {layer} placeholder', () => {
    const config = base();

    config.architecture.layerFiles = ['src/**/*.ts'];

    expect(() => validateBlueprint(config)).toThrow(/must include the "\{layer\}" placeholder/);
  });

  it('rejects a malformed extraEdge', () => {
    const config = base();

    config.architecture.extraEdges = ['components'];

    expect(() => validateBlueprint(config)).toThrow(/expected "from⇢to"/);
  });

  it('rejects an extraEdge pointing at an unknown target layer', () => {
    const config = base();

    config.architecture.extraEdges = ['components⇢contexts'];

    expect(() => validateBlueprint(config)).toThrow(/unknown layer "contexts"/);
  });

  it('rejects an extraEdge with an unknown source layer', () => {
    const config = base();

    config.architecture.extraEdges = ['ghost⇢services'];

    expect(() => validateBlueprint(config)).toThrow(/unknown layer "ghost"/);
  });

  it('rejects a dependency cycle introduced by an extraEdge', () => {
    const config = base();

    config.architecture.extraEdges = ['services⇢components'];

    expect(() => validateBlueprint(config)).toThrow(/dependency cycle/);
  });

  it('rejects lintOverrides that touch a managed rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = {
      'no-restricted-imports': 'off',
    };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

  it('accepts lintOverrides for a non-managed rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = {
      'react-refresh/only-export-components': 'off',
    };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects duplicate principle ids', () => {
    const config = base();

    config.principles = [
      { id: 'x', say: 'a', why: 'b', land: 'claude' },
      { id: 'x', say: 'c', why: 'd', land: 'lint' },
    ];

    expect(() => validateBlueprint(config)).toThrow(/Duplicate principle id/);
  });

  it('rejects a principle with a blank id', () => {
    const config = base();

    config.principles = [{ id: '  ', say: 'a', why: 'b', land: 'claude' }];

    expect(() => validateBlueprint(config)).toThrow(/non-empty id/);
  });

  it('rejects a rule with an invalid tier', () => {
    const config = base();

    config.rules = { maxLines: { tier: 'loud' as never, value: 400 } };

    expect(() => validateBlueprint(config)).toThrow(/invalid tier/);
  });

  it('accepts a rule as a bare tier string', () => {
    const config = base();

    config.rules = { noUtils: 'error' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});
