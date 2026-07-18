import { describe, expect, it } from 'vitest';

import {
  deriveEdges,
  detectCycle,
  getAllowedLayers,
  getForbiddenLayers,
  normalizeExtraEdges,
  parseEdge,
} from './graph';
import type { ArchitectureDef } from './types';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [{ name: 'components', does: '' }, { name: 'hooks', does: '' }, { name: 'services', does: '' }],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: [] },
    ...over,
  };
}

describe('parseEdge', () => {
  it('splits a well-formed edge', () => {
    expect(parseEdge('a⇢b')).toEqual(['a', 'b']);
  });

  it('throws on a malformed edge', () => {
    expect(() => parseEdge('a')).toThrow(/expected "from⇢to"/);
  });
});

describe('normalizeExtraEdges', () => {
  it('returns [] for undefined', () => {
    expect(normalizeExtraEdges(undefined)).toEqual([]);
  });

  it('normalizes strings and objects, preserving options', () => {
    expect(
      normalizeExtraEdges(['a→b', { edge: 'c⇢d', selfOnly: true, description: 'x' }]),
    ).toEqual([
      { from: 'a', to: 'b', selfOnly: undefined, description: undefined },
      { from: 'c', to: 'd', selfOnly: true, description: 'x' },
    ]);
  });
});

describe('deriveEdges', () => {
  it('builds the linear chain plus extra edges', () => {
    expect(deriveEdges(arch({ extraEdges: ['components⇢services'] }))).toEqual([
      { from: 'components', to: 'hooks' },
      { from: 'hooks', to: 'services' },
      { from: 'components', to: 'services', selfOnly: undefined, description: undefined },
    ]);
  });

  it('produces no chain edges for a single layer', () => {
    expect(deriveEdges(arch({ layers: [{ name: 'only', does: '' }] }))).toEqual([]);
  });
});

describe('getAllowedLayers', () => {
  const edges = deriveEdges(
    arch({ extraEdges: [{ edge: 'hooks⇢contexts', selfOnly: true }] }),
  );

  it('follows the chain transitively', () => {
    expect(getAllowedLayers(edges, 'components').sort()).toEqual(['hooks', 'services']);
  });

  it('does not re-export a selfOnly target down the chain', () => {
    // components → hooks → (contexts is selfOnly, reachable only from hooks)
    expect(getAllowedLayers(edges, 'components')).not.toContain('contexts');
    expect(getAllowedLayers(edges, 'hooks').sort()).toEqual(['contexts', 'services']);
  });
});

describe('getForbiddenLayers', () => {
  it('is every declared layer minus self and the allowed set', () => {
    const edges = deriveEdges(arch());
    const all = ['components', 'hooks', 'services'];

    expect(getForbiddenLayers(edges, all, 'services')).toEqual(['components', 'hooks']);
    expect(getForbiddenLayers(edges, all, 'components')).toEqual([]);
  });
});

describe('detectCycle', () => {
  it('returns null for an acyclic graph', () => {
    expect(detectCycle(deriveEdges(arch()))).toBeNull();
  });

  it('returns the cycle path when one exists', () => {
    const cycle = detectCycle(deriveEdges(arch({ extraEdges: ['services⇢components'] })));

    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });
});
