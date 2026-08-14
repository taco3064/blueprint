import { describe, expect, it } from 'vitest';

import {
  aliasLayerRoots,
  DEFAULT_MODULE_SHAPE,
  getDiagramEdges,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
  moduleShapeGroups,
  normalizeAllowedImporters,
} from './graph';
import type { ArchitectureDef } from './types';

function arch(): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'pages', does: '' },
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

/** `arch()` with a module shape declared on the named layers. */
function shaped(shapes: Record<string, { layout?: 'folder' | 'file'; entry?: string }>): ArchitectureDef {
  const base = arch();

  return {
    ...base,
    layers: base.layers.map((layer) => ({ ...layer, ...shapes[layer.name] })),
  };
}

describe('aliasLayerRoots', () => {
  it('bakes each alias target offset in, excluding targets with no layer surface (field #29)', () => {
    const roots = aliasLayerRoots({
      ...arch(),
      additionalAliases: {
        '~root': '.', // repo root — layers reachable through src/
        '~src': './src', // the source root itself — no offset
        '~shared': './src/shared', // subfolder — no layer surface
        '~vendor': '/vendor', // outside — no layer surface
        '~up': '../elsewhere', // .. never matches
      },
    });

    expect(roots).toEqual([
      { alias: '~app', prefix: [] },
      { alias: '~root', prefix: ['src'] },
      { alias: '~src', prefix: [] },
    ]);
  });

  it('honors a custom sourceRoot, including the project root', () => {
    expect(aliasLayerRoots({ ...arch(), sourceRoot: '.', additionalAliases: { '~x': '.' } }))
      .toEqual([{ alias: '~app', prefix: [] }, { alias: '~x', prefix: [] }]);

    expect(aliasLayerRoots({ ...arch(), sourceRoot: 'lib/app', additionalAliases: { '~lib': 'lib' } }))
      .toEqual([{ alias: '~app', prefix: [] }, { alias: '~lib', prefix: ['app'] }]);
  });
});

describe('getModuleShape', () => {
  it('applies the file defaults to a layer that declares neither key (field #23)', () => {
    expect(DEFAULT_MODULE_SHAPE).toEqual({ layout: 'file', entry: 'index' });
    expect(getModuleShape(arch(), 'pages')).toEqual({ layout: 'file', entry: 'index' });
  });

  it('fills the other key when a layer declares only one', () => {
    const one = shaped({ pages: { layout: 'folder' }, hooks: { entry: 'main' } });

    expect(getModuleShape(one, 'pages')).toEqual({ layout: 'folder', entry: 'index' });
    expect(getModuleShape(one, 'hooks')).toEqual({ layout: 'file', entry: 'main' });
  });

  it('falls back to the defaults for a layer that is not declared at all', () => {
    expect(getModuleShape(arch(), 'nope')).toEqual({ layout: 'file', entry: 'index' });
  });
});

describe('moduleShapeGroups', () => {
  it('collapses layers that agree into one group', () => {
    const groups = moduleShapeGroups(shaped(Object.fromEntries(
      ['pages', 'components', 'hooks', 'contexts', 'services'].map((name) => [name, { layout: 'folder' as const }]),
    )));

    expect(groups).toEqual([
      { layout: 'folder', entry: 'index', layers: ['pages', 'components', 'hooks', 'contexts', 'services'] },
    ]);
  });

  it('splits folder layers by entry, first-declared first', () => {
    const groups = moduleShapeGroups(shaped({
      pages: { layout: 'folder', entry: 'main' },
      components: { layout: 'folder' },
      hooks: { layout: 'folder', entry: 'main' },
    }));

    expect(groups).toEqual([
      { layout: 'folder', entry: 'main', layers: ['pages', 'hooks'] },
      { layout: 'folder', entry: 'index', layers: ['components'] },
      { layout: 'file', entry: 'index', layers: ['contexts', 'services'] },
    ]);
  });

  it('keys a file-layout layer on layout alone — its entry filename governs nothing', () => {
    const groups = moduleShapeGroups(shaped({ pages: { entry: 'main' }, components: { entry: 'other' } }));

    expect(groups).toHaveLength(1);
    expect(groups[0].layers).toEqual(['pages', 'components', 'hooks', 'contexts', 'services']);
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
    // components may reach hooks (default) but not contexts/services (restricted, exclude it)
    expect(getForbiddenLayers(arch(), 'components').sort()).toEqual([
      'contexts',
      'pages',
      'services',
    ]);
  });

  it('allows a listed importer through to a restricted layer', () => {
    // hooks is listed on both contexts and services → only upstream is forbidden
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
      // Spine edges carry `ordered` — adjacency, not a declared relation.
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
    // A trailing slash is invisible in a config and survives a copy-paste. Kept
    // as a segment, it becomes part of the layer offset — and an offset with an
    // empty component matches no path that exists, so the alias goes blind to
    // every layer behind it.
    const roots = aliasLayerRoots({ ...arch(), additionalAliases: { '~trail': './src/' } });

    expect(roots.find((root) => root.alias === '~trail')).toEqual({ alias: '~trail', prefix: [] });
  });
});
