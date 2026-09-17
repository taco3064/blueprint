import { LIFECYCLE_SINCE } from './catalog';
import type { LifecycleStateRead } from './state';
import type { LifecycleState, UpgradeCatalog } from './types';
import { compareVersions } from './version';

export type SourceCheckpoint
  = | { kind: 'state'; version: string; state: LifecycleState }
    | { kind: 'bootstrap'; version: string; evidence: 'installed-package' | 'legacy-config' }
    | { kind: 'missing-state'; installed: string }
    | { kind: 'invalid-state'; reason: string }
    | { kind: 'not-installed' }
    | { kind: 'mixed-installed'; versions: string[] };

export interface SourceCheckpointInput {
  state: LifecycleStateRead;
  installed: readonly (string | null)[];
  legacyShape: boolean;
  catalog: UpgradeCatalog;
}

export function sourceCheckpoint(input: SourceCheckpointInput): SourceCheckpoint {
  const { state } = input;

  if (state.status === 'invalid') {
    return { kind: 'invalid-state', reason: state.reason };
  }

  if (state.status === 'present') {
    return { kind: 'state', version: state.state.blueprint, state: state.state };
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

  return compareVersions(installed, LIFECYCLE_SINCE) >= 0
    ? { kind: 'missing-state', installed }
    : { kind: 'bootstrap', version: installed, evidence: 'installed-package' };
}
