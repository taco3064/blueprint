import { describe, expect, it } from 'vitest';

import { LIFECYCLE_SINCE, UPGRADE_CATALOG } from './catalog';
import { sourceCheckpoint } from './checkpoint';
import type { SourceCheckpointInput } from './checkpoint';
import type { LifecycleState } from './types';

const state: LifecycleState = {
  schema: 1,
  blueprint: '4.1.0',
  provenance: 'complete',
  operations: [],
  pending: null,
  applications: {},
};

function checkpoint(input: Partial<SourceCheckpointInput>) {
  return sourceCheckpoint({
    state: { status: 'missing' },
    installed: ['4.0.0'],
    legacyShape: false,
    catalog: UPGRADE_CATALOG,
    history: 'recorded',
    ...input,
  });
}

describe('sourceCheckpoint', () => {
  it('pins the lifecycle introduction release', () => {
    expect(LIFECYCLE_SINCE).toBe('4.1.0');
  });

  it('trusts recorded lifecycle state over whatever version is installed', () => {
    expect(checkpoint({ state: { status: 'present', state }, installed: ['4.2.0'] }))
      .toEqual({ kind: 'state', version: '4.1.0', state });
  });

  it('keeps present state authoritative whatever its Git history says', () => {
    for (const history of ['recorded', 'never-recorded', 'unknown'] as const) {
      expect(checkpoint({ state: { status: 'present', state }, installed: ['4.2.0'], history }))
        .toEqual({ kind: 'state', version: '4.1.0', state });
    }
  });

  it('fails closed on unreadable state', () => {
    expect(checkpoint({ state: { status: 'invalid', reason: 'json' } }))
      .toEqual({ kind: 'invalid-state', reason: 'json' });
  });

  it('refuses to bootstrap without an installed package to prove the source', () => {
    expect(checkpoint({ installed: [] })).toEqual({ kind: 'not-installed' });
    expect(checkpoint({ installed: ['4.0.0', null] })).toEqual({ kind: 'not-installed' });
  });

  it('refuses mixed installed versions inside one repository', () => {
    expect(checkpoint({ installed: ['4.0.0', '3.2.0', '4.0.0'] }))
      .toEqual({ kind: 'mixed-installed', versions: ['3.2.0', '4.0.0'] });
  });

  it('bootstraps a pre-lifecycle repository from its installed package', () => {
    for (const history of ['recorded', 'never-recorded', 'unknown'] as const) {
      expect(checkpoint({ installed: ['4.0.0', '4.0.0'], history }))
        .toEqual({ kind: 'bootstrap', version: '4.0.0', evidence: 'installed-package' });
    }
  });

  it('reports missing state when a lifecycle-aware install lost state it had committed', () => {
    expect(checkpoint({ installed: ['4.1.0'] }))
      .toEqual({ kind: 'missing-state', installed: '4.1.0' });

    expect(checkpoint({ installed: ['4.2.0'] }))
      .toEqual({ kind: 'missing-state', installed: '4.2.0' });
  });

  it('fails closed when Git history cannot show whether state was ever committed', () => {
    expect(checkpoint({ installed: ['4.1.0'], history: 'unknown' }))
      .toEqual({ kind: 'missing-state', installed: '4.1.0' });
  });

  it('bootstraps from the installed package when state never entered Git history', () => {
    expect(checkpoint({ installed: ['4.1.0'], history: 'never-recorded' }))
      .toEqual({ kind: 'bootstrap', version: '4.1.0', evidence: 'state-never-committed' });

    expect(checkpoint({ installed: ['4.2.0', '4.2.0'], history: 'never-recorded' }))
      .toEqual({ kind: 'bootstrap', version: '4.2.0', evidence: 'state-never-committed' });
  });

  it('uses an installed legacy package as the exact source checkpoint', () => {
    expect(checkpoint({ installed: ['3.2.0'], legacyShape: true }))
      .toEqual({ kind: 'bootstrap', version: '3.2.0', evidence: 'installed-package' });

    expect(checkpoint({ installed: ['3.1.0'], legacyShape: true }))
      .toEqual({ kind: 'bootstrap', version: '3.1.0', evidence: 'installed-package' });
  });

  it('does not round an ambiguous legacy source up to the supported checkpoint', () => {
    expect(checkpoint({ installed: ['4.1.0'], legacyShape: true, history: 'never-recorded' }))
      .toEqual({ kind: 'unproven-legacy-source', installed: '4.1.0', checkpoint: '3.2.0' });
  });

  it('never lets a legacy config shape rebuild lost or unprovable lifecycle state', () => {
    for (const history of ['recorded', 'unknown'] as const) {
      expect(checkpoint({ installed: ['4.1.0'], legacyShape: true, history }))
        .toEqual({ kind: 'missing-state', installed: '4.1.0' });
    }
  });
});
