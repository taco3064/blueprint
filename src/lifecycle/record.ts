import fs from 'node:fs';
import path from 'node:path';

import { adoptionProvenance } from './adoption';
import type { AppliedAction } from './adoption';
import { UPGRADE_CATALOG } from './catalog';
import { sourceCheckpoint } from './checkpoint';
import { installedPackage, runningPackage } from './package';
import { forgetPaths, mergeProvenance } from './provenance';
import { LIFECYCLE_FILE, readLifecycleState, serializeLifecycleState } from './state';
import type { LifecycleStateRead } from './state';
import type { LifecycleState } from './types';

export const UPGRADE_PLAYBOOK_FILE = 'blueprint-upgrade.md';

export interface RecordAdoptionInput {
  lifecycleRoot: string;
  applicationRoot: string;
  applied: readonly AppliedAction[];
  firstAdoption: boolean;
  legacyShape: boolean;
  runningVersion?: string | null;
}

export type RecordAdoptionOutcome
  = | { status: 'write'; file: string; content: string; established: 'first' | 'bootstrap' | null }
    | { status: 'skipped'; reason: 'unproven-checkpoint' | 'pending-upgrade' };

export function applicationKey(lifecycleRoot: string, applicationRoot: string): string {
  return path.relative(lifecycleRoot, applicationRoot).split(path.sep).join('/') || '.';
}

export function lifecycleStateProblem(lifecycleRoot: string): string | null {
  const read = readLifecycleState(lifecycleRoot);

  return read.status === 'invalid' ? read.reason : null;
}

function establishedState(
  input: RecordAdoptionInput,
  read: LifecycleStateRead,
): { state: LifecycleState; established: 'first' | 'bootstrap' } | RecordAdoptionOutcome {
  const running = input.runningVersion === undefined
    ? runningPackage()?.version ?? null
    : input.runningVersion;

  if (input.firstAdoption && running !== null) {
    return { state: emptyState(running, 'complete'), established: 'first' };
  }

  if (fs.existsSync(path.join(input.lifecycleRoot, UPGRADE_PLAYBOOK_FILE))) {
    return { status: 'skipped', reason: 'pending-upgrade' };
  }

  const checkpoint = sourceCheckpoint({
    state: read,
    installed: [installedPackage(input.applicationRoot)?.version ?? null],
    legacyShape: input.legacyShape,
    catalog: UPGRADE_CATALOG,
  });

  if (checkpoint.kind === 'bootstrap') {
    return { state: emptyState(checkpoint.version, 'partial'), established: 'bootstrap' };
  }

  return checkpoint.kind === 'missing-state'
    ? { state: emptyState(checkpoint.installed, 'partial'), established: 'bootstrap' }
    : { status: 'skipped', reason: 'unproven-checkpoint' };
}

function emptyState(version: string, provenance: LifecycleState['provenance']): LifecycleState {
  return {
    schema: 1, blueprint: version, provenance, operations: [], pending: null, applications: {},
  };
}

export function recordAdoption(input: RecordAdoptionInput): RecordAdoptionOutcome {
  const read = readLifecycleState(input.lifecycleRoot);
  let state: LifecycleState;
  let established: 'first' | 'bootstrap' | null = null;

  if (read.status === 'present') {
    state = read.state;
  } else {
    const outcome = establishedState(input, read);

    if ('status' in outcome) {
      return outcome;
    }

    ({ state, established } = outcome);
  }

  const key = applicationKey(input.lifecycleRoot, input.applicationRoot);
  const { records, removed } = adoptionProvenance(input.applied);
  const current = state.applications[key]?.provenance ?? [];

  const provenance = mergeProvenance(forgetPaths(current, removed), records);
  const applications = { ...state.applications, [key]: { provenance } };

  return {
    status: 'write',
    file: path.join(input.lifecycleRoot, LIFECYCLE_FILE),
    content: serializeLifecycleState({ ...state, applications }),
    established,
  };
}
