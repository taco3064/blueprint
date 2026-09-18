import fs from 'node:fs';
import path from 'node:path';

import { planIdentity } from './plan';
import { isApplicationKey, isRecord, parseProvenance } from './provenance';
import type {
  ApplicationLifecycle,
  LifecycleState,
  PendingOperation,
  PendingUpgrade,
} from './types';
import { isVersion } from './version';

export const LIFECYCLE_FILE = '.blueprint-lifecycle.json';

export type LifecycleStateRead
  = | { status: 'missing' }
    | { status: 'invalid'; reason: string }
    | { status: 'present'; state: LifecycleState };

export function readLifecycleState(root: string): LifecycleStateRead {
  let text: string;

  try {
    text = fs.readFileSync(path.join(root, LIFECYCLE_FILE), 'utf-8');
  } catch {
    return { status: 'missing' };
  }

  return parseLifecycleState(text);
}

export function parseLifecycleState(text: string): LifecycleStateRead {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return { status: 'invalid', reason: 'json' };
  }

  const reason = stateProblem(value);

  return reason === null
    ? { status: 'present', state: value as LifecycleState }
    : { status: 'invalid', reason };
}

export function writeLifecycleState(root: string, state: LifecycleState): void {
  fs.writeFileSync(path.join(root, LIFECYCLE_FILE), serializeLifecycleState(state));
}

export function serializeLifecycleState(state: LifecycleState): string {
  const applications = Object.fromEntries(Object.keys(state.applications).sort()
    .map((root) => [root, state.applications[root]]));

  return `${JSON.stringify({ ...state, applications }, null, 2)}\n`;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isApplicationList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isApplicationKey);
}

function stateProblem(value: unknown): string | null {
  if (!isRecord(value) || value.schema !== 1) {
    return 'schema';
  }

  const checks: [string, boolean][] = [
    ['blueprint', value.blueprint === null || isVersion(value.blueprint)],
    ['provenance', value.provenance === 'complete' || value.provenance === 'partial'],
    ['operations', isStringList(value.operations)],
    ['pending', value.pending === null || pendingValid(value.pending)],
    ['applications', applicationsValid(value.applications)],
  ];

  return checks.find(([, valid]) => !valid)?.[0] ?? null;
}

function pendingValid(value: unknown): value is PendingUpgrade {
  return isRecord(value)
    && isVersion(value.from)
    && isVersion(value.to)
    && isStringList(value.migrations)
    && isStringList(value.completed)
    && Array.isArray(value.operations)
    && value.operations.every(pendingOperationValid)
    && value.plan === planIdentity(value as unknown as PendingUpgrade);
}

function pendingOperationValid(value: unknown): value is PendingOperation {
  return isRecord(value)
    && typeof value.id === 'string'
    && isApplicationList(value.applications)
    && isRecord(value.evidence)
    && Object.keys(value.evidence).every(isApplicationKey)
    && Object.values(value.evidence).every(isStringList)
    && Array.isArray(value.supersedes)
    && value.supersedes.every((entry) => isRecord(entry)
      && typeof entry.id === 'string'
      && typeof entry.completed === 'boolean');
}

function applicationsValid(value: unknown): value is Record<string, ApplicationLifecycle> {
  return isRecord(value)
    && Object.keys(value).every(isApplicationKey)
    && Object.values(value).every((application) =>
      isRecord(application) && parseProvenance(application.provenance) !== null);
}
