import { LIFECYCLE_SINCE } from './catalog';
import type { LifecycleStateRead } from './state';
import type { LifecycleStateHistory } from './state-history';
import type { LifecycleState, UpgradeCatalog } from './types';
import { compareVersions } from './version';

export type BootstrapEvidence = 'installed-package' | 'legacy-config' | 'state-never-committed';

export type SourceCheckpoint
  = | { kind: 'state'; version: string; state: LifecycleState }
    | { kind: 'adoption-incomplete' }
    | { kind: 'bootstrap'; version: string; evidence: BootstrapEvidence }
    | { kind: 'missing-state'; installed: string }
    | { kind: 'invalid-state'; reason: string }
    | { kind: 'not-installed' }
    | { kind: 'mixed-installed'; versions: string[] };

export interface SourceCheckpointInput {
  state: LifecycleStateRead;
  installed: readonly (string | null)[];
  legacyShape: boolean;
  catalog: UpgradeCatalog;
  history: LifecycleStateHistory;
}

export function sourceCheckpoint(input: SourceCheckpointInput): SourceCheckpoint {
  const { state } = input;

  if (state.status === 'invalid') {
    return { kind: 'invalid-state', reason: state.reason };
  }

  if (state.status === 'present') {
    return state.state.blueprint === null
      ? { kind: 'adoption-incomplete' }
      : { kind: 'state', version: state.state.blueprint, state: state.state };
  }

  if (!input.installed.length || input.installed.some((version) => version === null)) {
    return { kind: 'not-installed' };
  }

  const versions = [...new Set(input.installed as string[])].sort(compareVersions);

  if (versions.length > 1) {
    return { kind: 'mixed-installed', versions };
  }

  return bootstrapCheckpoint(versions[0], input);
}

function bootstrapCheckpoint(installed: string, input: SourceCheckpointInput): SourceCheckpoint {
  const legacy = input.catalog.legacyConfigCheckpoint;

  if (input.legacyShape) {
    return {
      kind: 'bootstrap',
      version: [installed, legacy].sort(compareVersions)[0],
      evidence: 'legacy-config',
    };
  }

  if (compareVersions(installed, LIFECYCLE_SINCE) < 0) {
    return { kind: 'bootstrap', version: installed, evidence: 'installed-package' };
  }

  return input.history === 'never-recorded'
    ? { kind: 'bootstrap', version: installed, evidence: 'state-never-committed' }
    : { kind: 'missing-state', installed };
}
