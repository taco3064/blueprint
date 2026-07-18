import { describe, expect, it } from 'vitest';

import { defineBlueprint, validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      layers: [
        { name: 'components', does: '可重用 UI', mustNot: ['import services'] },
        { name: 'hooks', does: 'inject / 加工 state' },
        { name: 'services', does: '網路原件', owns: ['axios', 'fetch'] },
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

  it('accepts extraEdges that reference declared layers', () => {
    const config = base();

    config.architecture.extraEdges = ['components⇢services'];

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts →, ->, and ⇢ as edge separators', () => {
    for (const edge of ['hooks→services', 'hooks->services', 'hooks⇢services']) {
      const config = base();

      config.architecture.extraEdges = [edge];

      expect(() => validateBlueprint(config)).not.toThrow();
    }
  });
});

describe('validateBlueprint', () => {
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

  it('rejects a missing module entry', () => {
    const config = base();

    config.architecture.module.entry = '';

    expect(() => validateBlueprint(config)).toThrow(/module\.entry/);
  });

  it('rejects an extraEdge pointing at an unknown layer', () => {
    const config = base();

    config.architecture.extraEdges = ['components⇢contexts'];

    expect(() => validateBlueprint(config)).toThrow(/unknown layer "contexts"/);
  });

  it('rejects a malformed extraEdge', () => {
    const config = base();

    config.architecture.extraEdges = ['components'];

    expect(() => validateBlueprint(config)).toThrow(/expected "from⇢to"/);
  });

  it('rejects duplicate principle ids', () => {
    const config = base();

    config.principles = [
      { id: 'x', say: 'a', why: 'b', land: 'claude' },
      { id: 'x', say: 'c', why: 'd', land: 'lint' },
    ];

    expect(() => validateBlueprint(config)).toThrow(/Duplicate principle id/);
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

  it('rejects a missing architecture', () => {
    const config = base();

    config.architecture = undefined as never;

    expect(() => validateBlueprint(config)).toThrow(/must be an array/);
  });

  it('rejects a non-array module.private', () => {
    const config = base();

    config.architecture.module.private = 'nope' as never;

    expect(() => validateBlueprint(config)).toThrow(/module\.private/);
  });

  it('rejects an extraEdge with an unknown source layer', () => {
    const config = base();

    config.architecture.extraEdges = ['ghost⇢services'];

    expect(() => validateBlueprint(config)).toThrow(/unknown layer "ghost"/);
  });

  it('rejects a principle with a blank id', () => {
    const config = base();

    config.principles = [{ id: '  ', say: 'a', why: 'b', land: 'claude' }];

    expect(() => validateBlueprint(config)).toThrow(/non-empty id/);
  });
});
