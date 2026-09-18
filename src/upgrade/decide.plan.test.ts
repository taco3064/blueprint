import { describe, expect, it } from 'vitest';

import { withPlanIdentity } from '../lifecycle';
import type { LifecycleState, UpgradeCatalog, UpgradeOperation } from '../lifecycle';
import { decideUpgrade } from './decide';
import type { DecisionInput } from './decide';
import type { UpgradeApplication, UpgradeFacts } from './facts';

function op(id: string, introducedIn: string): UpgradeOperation {
  return {
    id, introducedIn, requires: [], cancels: [], supersedes: [],
    applicability: { kind: 'always' }, verification: { kind: 'confirm' },
  };
}

const CATALOG: UpgradeCatalog = {
  supportedFrom: '3.2.0',
  legacyConfigCheckpoint: '3.2.0',
  retired: [],
  migrations: [
    {
      id: 'reshape',
      introducedIn: '4.0.0',
      supportsFrom: '3.2.0',
      applicability: { kind: 'always' },
    },
  ],
  operations: [op('first', '4.0.0'), op('second', '4.1.0')],
};

function application(key: string, installed: string | null): UpgradeApplication {
  return {
    key,
    root: `/repo/${key}`,
    installed: installed === null ? null : { root: `/repo/${key}/node_modules/x`, version: installed },
    manifest: { root: `/repo/${key}`, section: 'devDependencies' },
    packageManager: 'npm',
    facts: { root: key, legacyShape: false, legacyKeys: {} },
  };
}

function lifecycle(patch: Partial<LifecycleState>): LifecycleState {
  return {
    schema: 1, blueprint: '4.0.0', provenance: 'complete', operations: [], pending: null,
    applications: {}, ...patch,
  };
}

function decide(facts: Partial<UpgradeFacts>, target = '4.1.0') {
  const input: DecisionInput = {
    facts: {
      root: '/repo',
      applications: [application('.', '4.1.0')],
      state: { status: 'missing' },
      checkpoint: { kind: 'not-installed' },
      git: { repository: true, changes: [] },
      workflows: [],
      unreadable: null,
      ...facts,
    },
    running: { root: '/runner', version: target },
    catalog: CATALOG,
    installSpec: '@kekkai/blueprint@4.1.0',
    hasInstruction: () => true,
  };

  return decideUpgrade(input);
}

const stateCheckpoint = (state: LifecycleState) =>
  ({ kind: 'state', version: state.blueprint!, state }) as const;

describe('decideUpgrade · checkpoint refusals', () => {
  it('names only the applications that have no installed package', () => {
    expect(decide({
      applications: [application('apps/web', null), application('apps/admin', '4.0.0')],
    })).toEqual({
      kind: 'refuse', refusal: { kind: 'not-installed', applications: ['apps/web'] },
    });
  });

  it('refuses recorded history the running catalog could not have produced', () => {
    const state = lifecycle({ blueprint: '3.2.0', operations: ['first'] });

    expect(decide({ state: { status: 'present', state }, checkpoint: stateCheckpoint(state) }))
      .toEqual({
        kind: 'refuse',
        refusal: { kind: 'invalid-state', file: '.blueprint-lifecycle.json', reason: 'operations' },
      });
  });

  it('refuses records that never completed an adoption', () => {
    expect(decide({ checkpoint: { kind: 'adoption-incomplete' } })).toEqual({
      kind: 'refuse',
      refusal: { kind: 'adoption-incomplete', file: '.blueprint-lifecycle.json' },
    });
  });

  it('refuses unreadable, missing, and mixed checkpoints', () => {
    expect(decide({ checkpoint: { kind: 'invalid-state', reason: 'json' } })).toEqual({
      kind: 'refuse',
      refusal: { kind: 'invalid-state', file: '.blueprint-lifecycle.json', reason: 'json' },
    });

    expect(decide({ checkpoint: { kind: 'missing-state', installed: '4.1.0' } })).toEqual({
      kind: 'refuse',
      refusal: { kind: 'missing-state', file: '.blueprint-lifecycle.json', installed: '4.1.0' },
    });

    expect(decide({ checkpoint: { kind: 'mixed-installed', versions: ['4.0.0', '4.1.0'] } }))
      .toEqual({
        kind: 'refuse', refusal: { kind: 'mixed-installed', versions: ['4.0.0', '4.1.0'] },
      });
  });
});

describe('decideUpgrade · plans', () => {
  it('starts from recorded state with the resolved plan', () => {
    const state = lifecycle({ blueprint: '3.2.0' });

    expect(decide({
      applications: [application('.', '3.2.0')],
      state: { status: 'present', state },
      checkpoint: stateCheckpoint(state),
    })).toEqual({
      kind: 'proceed',
      mode: 'start',
      source: '3.2.0',
      evidence: 'state',
      target: '4.1.0',
      state,
      pending: withPlanIdentity({
        from: '3.2.0',
        to: '4.1.0',
        migrations: ['reshape'],
        operations: [
          { id: 'first', applications: ['.'], evidence: {}, supersedes: [] },
          { id: 'second', applications: ['.'], evidence: {}, supersedes: [] },
        ],
        completed: [],
      }),
      migrations: [{ id: 'reshape', applications: ['.'] }],
      suppressed: [],
      inapplicable: [],
      installs: [{
        manifest: '.', root: '/repo/.', command: 'npm install -D @kekkai/blueprint@4.1.0',
      }],
    });
  });

  it('re-plans a pending upgrade without repeating its completed operations', () => {
    const state = lifecycle({
      blueprint: '3.2.0',
      pending: withPlanIdentity({
        from: '3.2.0', to: '4.0.0', migrations: ['reshape'], completed: ['first'],
        operations: [{ id: 'first', applications: ['.'], evidence: {}, supersedes: [] }],
      }),
    });

    const decision = decide({
      state: { status: 'present', state }, checkpoint: stateCheckpoint(state),
    });

    expect(decision).toMatchObject({
      kind: 'proceed',
      mode: 'replan',
      source: '3.2.0',
      pending: {
        from: '3.2.0',
        to: '4.1.0',
        completed: ['first'],
        operations: [
          { id: 'first', applications: ['.'], evidence: {}, supersedes: [] },
          { id: 'second', applications: ['.'], evidence: {}, supersedes: [] },
        ],
      },
      installs: [],
    });

    const unfinished = {
      ...state, pending: withPlanIdentity({ ...state.pending!, completed: [] }),
    };

    expect(decide({
      state: { status: 'present', state: unfinished }, checkpoint: stateCheckpoint(unfinished),
    })).toMatchObject({
      pending: { completed: [], operations: [{ id: 'first' }, { id: 'second' }] },
    });
  });

  it('resumes the recorded pending upgrade exactly as recorded', () => {
    const pending = withPlanIdentity({
      from: '3.2.0', to: '4.1.0', migrations: ['reshape'], completed: [],
      operations: [{ id: 'second', applications: ['.'], evidence: {}, supersedes: [] }],
    });

    const state = lifecycle({ blueprint: '3.2.0', pending });

    expect(decide({ state: { status: 'present', state }, checkpoint: stateCheckpoint(state) }))
      .toEqual({
        kind: 'proceed',
        mode: 'resume',
        source: '3.2.0',
        evidence: 'state',
        target: '4.1.0',
        state,
        pending,
        migrations: [{ id: 'reshape', applications: [] }],
        suppressed: [],
        inapplicable: [],
        installs: [],
      });
  });
});

describe('decideUpgrade · installed package evidence', () => {
  it('repairs the install instead of reporting current when the package is behind', () => {
    const state = lifecycle({ blueprint: '4.1.0' });

    const recorded = {
      state: { status: 'present' as const, state },
      checkpoint: stateCheckpoint(state),
    };

    expect(decide({ ...recorded, applications: [application('.', '4.1.0')] }))
      .toEqual({ kind: 'current', version: '4.1.0' });

    expect(decide({
      ...recorded,
      applications: [application('.', '4.1.0'), application('apps/web', null)],
    })).toMatchObject({
      kind: 'proceed',
      installs: [{ manifest: 'apps/web', command: 'npm install -D @kekkai/blueprint@4.1.0' }],
    });

    for (const installed of ['4.0.0', null]) {
      expect(decide({ ...recorded, applications: [application('.', installed)] })).toMatchObject({
        kind: 'proceed',
        mode: 'start',
        source: '4.1.0',
        target: '4.1.0',
        pending: { from: '4.1.0', to: '4.1.0', operations: [] },
        installs: [{ manifest: '.', command: 'npm install -D @kekkai/blueprint@4.1.0' }],
      });
    }
  });

  it('refuses to move an application back to an older running package', () => {
    const state = lifecycle({ blueprint: '4.1.0' });

    expect(decide({
      state: { status: 'present', state },
      checkpoint: stateCheckpoint(state),
      applications: [application('apps/web', '4.2.0'), application('.', '4.1.0')],
    })).toEqual({
      kind: 'refuse',
      refusal: {
        kind: 'mixed-installed', versions: ['4.1.0', '4.2.0'],
      },
    });

    expect(decide({
      state: { status: 'present', state },
      checkpoint: stateCheckpoint(state),
      applications: [application('apps/web', '4.2.0')],
    })).toEqual({
      kind: 'refuse',
      refusal: {
        kind: 'installed-newer', application: 'apps/web', installed: '4.2.0', target: '4.1.0',
      },
    });
  });

  it('establishes state for an unrecorded adoption already on the running release', () => {
    expect(decide({
      checkpoint: { kind: 'bootstrap', version: '4.1.0', evidence: 'installed-package' },
    })).toEqual({
      kind: 'proceed',
      mode: 'start',
      source: '4.1.0',
      evidence: 'installed-package',
      target: '4.1.0',
      state: lifecycle({ blueprint: '4.1.0', provenance: 'partial' }),
      pending: withPlanIdentity({
        from: '4.1.0', to: '4.1.0', migrations: [], operations: [], completed: [],
      }),
      migrations: [],
      suppressed: [],
      inapplicable: [],
      installs: [],
    });
  });
});
