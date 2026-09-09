import { describe, expect, it } from 'vitest';

import {
  aliasLayerRoots,
  aliasSpecifier,
  getDiagramEdges,
  getForbiddenLayers,
  getSelfOnlyTargets,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { ArchitectureDef } from './types';

function arch(): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'pages', does: '', layout: 'folder', entry: 'index' },
      { name: 'components', does: '' },
      { name: 'hooks', does: '' },
      {
        name: 'contexts',
        does: '',
        allowedImporters: [{ layer: 'hooks', selfOnly: true, description: 'Context only' }],
      },
      { name: 'services', does: '', allowedImporters: ['hooks', 'contexts'] },
    ],
  };
}

describe('aliasLayerRoots', () => {
  it('bakes each alias target offset in, excluding targets with no layer surface (field '
    + '#29)', () => {
    const roots = aliasLayerRoots({
      ...arch(),
      additionalAliases: {
        '~root': '.',
        '~src': './src',
        '~shared': './src/shared',
        '~vendor': '/vendor',
        '~up': '../elsewhere',
      },
    });

    expect(roots).toEqual([
      { alias: '~app', prefix: [] },
      { alias: '~root', prefix: ['src'] },
      { alias: '~src', prefix: [] },
      { alias: '~shared', prefix: [], prepend: ['shared'] },
    ]);
  });

  it('honors a custom sourceRoot, including the project root', () => {
    expect(aliasLayerRoots({ ...arch(), sourceRoot: '.', additionalAliases: { '~x': '.' } }))
      .toEqual([{ alias: '~app', prefix: [] }, { alias: '~x', prefix: [] }]);

    expect(
      aliasLayerRoots({ ...arch(), sourceRoot: 'lib/app', additionalAliases: { '~lib': 'lib' } }),
    )
      .toEqual([{ alias: '~app', prefix: [] }, { alias: '~lib', prefix: ['app'] }]);
  });
});

describe('aliasSpecifier', () => {
  it('resolves legacy strings, ancestor aliases, and aliases below sourceRoot', () => {
    expect(aliasSpecifier('~app', 'shared')).toBe('~app/shared');

    expect(aliasSpecifier({ alias: '~root', prefix: ['src'] }, 'shared'))
      .toBe('~root/src/shared');

    expect(aliasSpecifier({ alias: '~shared', prefix: [], prepend: ['shared'] }, 'shared'))
      .toBe('~shared');

    expect(aliasSpecifier({ alias: '~shared', prefix: [], prepend: ['shared'] }, 'app'))
      .toBeNull();
  });

  it('includes declared module identity for module-first aliases', () => {
    expect(aliasSpecifier('~app', 'hooks', 'auth')).toBe('~app/auth/hooks');

    expect(aliasSpecifier({ alias: '~auth', prefix: [], prepend: ['auth'] }, 'hooks', 'auth'))
      .toBe('~auth/hooks');

    expect(aliasSpecifier({ alias: '~auth', prefix: [], prepend: ['auth'] }, 'hooks', 'checkout'))
      .toBeNull();
  });
});

describe('getUnitShape', () => {
  it('defaults every layer to file units with an index entry', () => {
    expect(getUnitShape(arch(), 'components')).toEqual({ layout: 'file', entry: 'index' });
  });

  it('resolves per-layer folder and entry configuration', () => {
    expect(getUnitShape(arch(), 'pages')).toEqual({ layout: 'folder', entry: 'index' });

    const custom = arch();

    custom.layers[2] = { ...custom.layers[2], layout: 'folder', entry: 'public' };
    expect(getUnitShape(custom, 'hooks')).toEqual({ layout: 'folder', entry: 'public' });
  });
});

describe('normalizeAllowedImporters', () => {
  it('returns [] for undefined and normalizes strings', () => {
    expect(normalizeAllowedImporters(undefined)).toEqual([]);

    expect(normalizeAllowedImporters(['a', { layer: 'b', selfOnly: true }])).toEqual([
      { layer: 'a' },
      { layer: 'b', selfOnly: true },
    ]);
  });
});

describe('getForbiddenLayers', () => {
  it('forbids upstream layers and restricted layers that exclude the importer', () => {
    expect(getForbiddenLayers(arch(), 'components').sort()).toEqual([
      'contexts',
      'pages',
      'services',
    ]);
  });

  it('allows a listed importer through to a restricted layer', () => {
    expect(getForbiddenLayers(arch(), 'hooks').sort()).toEqual(['components', 'pages']);
  });

  it('never forbids a layer from itself', () => {
    expect(getForbiddenLayers(arch(), 'services')).not.toContain('services');
  });
});

describe('getSelfOnlyTargets', () => {
  it('lists layers importable-but-not-re-exportable by the layer', () => {
    expect(getSelfOnlyTargets(arch(), 'hooks')).toEqual(['contexts']);
    expect(getSelfOnlyTargets(arch(), 'components')).toEqual([]);
  });
});

describe('getDiagramEdges', () => {
  it('draws the adjacent spine for default layers and explicit edges for restricted ones', () => {
    expect(getDiagramEdges(arch())).toEqual([
      { from: 'pages', to: 'components', ordered: true },
      { from: 'components', to: 'hooks', ordered: true },
      { from: 'hooks', to: 'contexts', selfOnly: true, description: 'Context only' },
      { from: 'hooks', to: 'services', selfOnly: undefined, description: undefined },
      { from: 'contexts', to: 'services', selfOnly: undefined, description: undefined },
    ]);
  });
});

describe('aliasLayerRoots · an alias target with a trailing slash', () => {
  it('ignores the empty segment a trailing slash leaves behind', () => {
    const roots = aliasLayerRoots({ ...arch(), additionalAliases: { '~trail': './src/' } });

    expect(roots.find((root) => root.alias === '~trail')).toEqual({ alias: '~trail', prefix: [] });
  });
});
