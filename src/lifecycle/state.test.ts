import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LIFECYCLE_FILE,
  parseLifecycleState,
  readLifecycleState,
  serializeLifecycleState,
} from './state';
import type { LifecycleState } from './types';

const valid: LifecycleState = {
  schema: 1,
  blueprint: '4.1.0',
  provenance: 'complete',
  operations: ['review-retired-module-private'],
  pending: {
    from: '3.2.0',
    to: '4.1.0',
    migrations: ['legacy-unit-shape'],
    operations: [{
      id: 'review-retired-module-private',
      applications: ['.'],
      evidence: { '.': ['hooks'] },
      supersedes: [{ id: 'older', completed: true }],
    }],
    completed: [],
  },
  applications: {
    'apps/web': { provenance: [{ kind: 'generated', path: 'docs/architecture-handbook.md' }] },
    '.': { provenance: [] },
  },
};

function operation(patch: Record<string, unknown>) {
  const [first] = valid.pending!.operations;

  return { pending: { ...valid.pending, operations: [{ ...first, ...patch }] } };
}

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-state-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('lifecycle state file', () => {
  it('reads a missing file as missing, never as an empty lifecycle', () => {
    expect(readLifecycleState(root)).toEqual({ status: 'missing' });
  });

  it('round-trips a valid state with sorted application keys', () => {
    const text = serializeLifecycleState(valid);

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), text);

    expect(LIFECYCLE_FILE).toBe('.blueprint-lifecycle.json');
    expect(text.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(text).applications)).toEqual(['.', 'apps/web']);
    expect(readLifecycleState(root)).toEqual({ status: 'present', state: JSON.parse(text) });
  });

  it('accepts a state without pending work', () => {
    expect(parseLifecycleState(JSON.stringify({ ...valid, pending: null })).status).toBe('present');
  });

  it('reports malformed JSON and unsupported schemas', () => {
    expect(parseLifecycleState('{')).toEqual({ status: 'invalid', reason: 'json' });
    expect(parseLifecycleState('[]')).toEqual({ status: 'invalid', reason: 'schema' });

    expect(parseLifecycleState(JSON.stringify({ ...valid, schema: 2 })))
      .toEqual({ status: 'invalid', reason: 'schema' });
  });

  it.each([
    ['blueprint', { blueprint: '4.1' }],
    ['provenance', { provenance: 'unknown' }],
    ['operations', { operations: [1] }],
    ['operations', { operations: 'x' }],
    ['pending', { pending: {} }],
    ['pending', { pending: { ...valid.pending, from: 'x' } }],
    ['pending', { pending: { ...valid.pending, to: 'x' } }],
    ['pending', { pending: { ...valid.pending, migrations: [2] } }],
    ['pending', { pending: { ...valid.pending, completed: null } }],
    ['pending', { pending: { ...valid.pending, operations: 'x' } }],
    ['pending', { pending: { ...valid.pending, operations: [null] } }],
    ['pending', operation({ id: 3 })],
    ['pending', operation({ applications: [3] })],
    ['pending', operation({ evidence: [] })],
    ['pending', operation({ evidence: { '.': 'x' } })],
    ['pending', operation({ supersedes: 'x' })],
    ['pending', operation({ supersedes: ['x'] })],
    ['pending', operation({ supersedes: [{ id: 1, completed: true }] })],
    ['pending', operation({ supersedes: [{ id: 'x', completed: 'yes' }] })],
    ['applications', { applications: [] }],
    ['applications', { applications: { '.': null } }],
    ['applications', { applications: { '.': { provenance: [{ kind: 'unknown' }] } } }],
  ])('names the invalid %s field', (reason, patch) => {
    expect(parseLifecycleState(JSON.stringify({ ...valid, ...patch })))
      .toEqual({ status: 'invalid', reason });
  });
});
