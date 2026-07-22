import { describe, expect, it } from 'vitest';

import {
  getDiagramEdges,
  getForbiddenLayers,
  getSelfOnlyTargets,
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
    module: { layout: 'folder', entry: 'index', private: [] },
  };
}

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
