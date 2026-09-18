import fs from 'node:fs';
import path from 'node:path';

import { findConfigFiles } from '../project';
import { adoptionProvenance } from './adoption';
import type { AppliedAction } from './adoption';
import { LIFECYCLE_SINCE, UPGRADE_CATALOG } from './catalog';
import { sourceCheckpoint } from './checkpoint';
import { installedPackage, runningPackage } from './package';
import { forgetPaths, mergeProvenance } from './provenance';
import { readLifecycleState, serializeLifecycleState } from './state';
import type { LifecycleStateRead } from './state';
import type { LifecycleState } from './types';
import { compareVersions } from './version';

export const UPGRADE_PLAYBOOK_FILE = 'blueprint-upgrade.md';

export type LifecycleEstablishment = 'first' | 'bootstrap' | 'records-only' | null;

export interface RecordAdoptionInput {
  lifecycleRoot: string;
  applicationRoot: string;
  applied: readonly AppliedAction[];
  firstAdoption: boolean;
  legacyShape: boolean;
  finished: boolean;
  runningVersion?: string | null;
}

export type RecordAdoptionOutcome
  = | { status: 'write'; content: string; established: LifecycleEstablishment }
    | { status: 'skipped'; reason: 'unproven-checkpoint' | 'pending-upgrade' | 'missing-state' };

export function applicationKey(lifecycleRoot: string, applicationRoot: string): string {
  return path.relative(lifecycleRoot, applicationRoot).split(path.sep).join('/') || '.';
}

export function lifecycleStateProblem(lifecycleRoot: string): string | null {
  const read = readLifecycleState(lifecycleRoot);

  return read.status === 'invalid' ? read.reason : null;
}

export function lostLifecycleState(lifecycleRoot: string): string | null {
  if (readLifecycleState(lifecycleRoot).status !== 'missing') {
    return null;
  }

  const aware = findConfigFiles(lifecycleRoot)
    .map((file) => installedPackage(path.dirname(file))?.version ?? null)
    .filter((version): version is string => version !== null)
    .filter((version) => compareVersions(version, LIFECYCLE_SINCE) >= 0)
    .sort(compareVersions);

  return aware.at(-1) ?? null;
}

function runningVersion(input: RecordAdoptionInput): string | null {
  return input.runningVersion === undefined
    ? runningPackage()?.version ?? null
    : input.runningVersion;
}

function establishedState(
  input: RecordAdoptionInput,
  read: LifecycleStateRead,
): { state: LifecycleState; established: LifecycleEstablishment } | RecordAdoptionOutcome {
  const running = runningVersion(input);

  if (input.firstAdoption && running !== null) {
    return input.finished
      ? { state: emptyState(running, 'complete'), established: 'first' }
      : { state: emptyState(null, 'complete'), established: 'records-only' };
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
    ? { status: 'skipped', reason: 'missing-state' }
    : { status: 'skipped', reason: 'unproven-checkpoint' };
}

function emptyState(
  version: string | null,
  provenance: LifecycleState['provenance'],
): LifecycleState {
  return {
    schema: 1, blueprint: version, provenance, operations: [], pending: null, applications: {},
  };
}

function recordedState(
  input: RecordAdoptionInput,
  state: LifecycleState,
): { state: LifecycleState; established: LifecycleEstablishment } {
  const running = runningVersion(input);

  if (state.blueprint !== null) {
    return { state, established: null };
  }

  return input.finished && running !== null
    ? { state: { ...state, blueprint: running }, established: 'first' }
    : { state, established: 'records-only' };
}

export function recordAdoption(input: RecordAdoptionInput): RecordAdoptionOutcome {
  const read = readLifecycleState(input.lifecycleRoot);

  const resolved = read.status === 'present'
    ? recordedState(input, read.state)
    : establishedState(input, read);

  if ('status' in resolved) {
    return resolved;
  }

  const { state, established } = resolved;
  const key = applicationKey(input.lifecycleRoot, input.applicationRoot);
  const { records, removed } = adoptionProvenance(input.applied);
  const current = state.applications[key]?.provenance ?? [];

  const provenance = mergeProvenance(forgetPaths(current, removed), records);
  const applications = { ...state.applications, [key]: { provenance } };

  return {
    status: 'write',
    content: serializeLifecycleState({ ...state, applications }),
    established,
  };
}
