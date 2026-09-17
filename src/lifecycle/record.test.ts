import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runningPackage } from './package';
import {
  applicationKey,
  lifecycleStateProblem,
  recordAdoption,
  UPGRADE_PLAYBOOK_FILE,
} from './record';
import type { RecordAdoptionInput } from './record';
import { LIFECYCLE_FILE, serializeLifecycleState } from './state';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-record-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function install(version: string): void {
  const dir = path.join(root, 'node_modules/@kekkai/blueprint');

  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: '@kekkai/blueprint', version }),
  );
}

function record(input: Partial<RecordAdoptionInput> = {}) {
  return recordAdoption({
    lifecycleRoot: root,
    applicationRoot: root,
    applied: [{ kind: 'mkdir', path: 'src/pages' }],
    firstAdoption: false,
    legacyShape: false,
    runningVersion: '4.1.0',
    ...input,
  });
}

function written(outcome: ReturnType<typeof recordAdoption>) {
  expect(outcome.status).toBe('write');

  return JSON.parse((outcome as { content: string }).content);
}

describe('recordAdoption', () => {
  it('keys applications relative to the lifecycle root', () => {
    expect(applicationKey(root, root)).toBe('.');
    expect(applicationKey(root, path.join(root, 'apps', 'web'))).toBe('apps/web');
  });

  it('establishes a complete lifecycle at the running version on first adoption', () => {
    const outcome = record({ firstAdoption: true });

    expect(outcome).toMatchObject({ file: path.join(root, LIFECYCLE_FILE), established: 'first' });

    expect(written(outcome)).toEqual({
      schema: 1,
      blueprint: '4.1.0',
      provenance: 'complete',
      operations: [],
      pending: null,
      applications: { '.': { provenance: [{ kind: 'directory', path: 'src/pages' }] } },
    });
  });

  it('defaults the running version to this package', () => {
    expect(written(record({ firstAdoption: true, runningVersion: undefined })).blueprint)
      .toBe(runningPackage()!.version);
  });

  it('bootstraps a partial lifecycle for an already adopted pre-lifecycle repository', () => {
    install('4.0.0');

    const outcome = record({ firstAdoption: true, runningVersion: null });

    expect(outcome).toMatchObject({ established: 'bootstrap' });
    expect(written(outcome)).toMatchObject({ blueprint: '4.0.0', provenance: 'partial' });
  });

  it('re-establishes a missing lifecycle from a lifecycle-aware installed package', () => {
    install('4.2.0');

    expect(written(record())).toMatchObject({ blueprint: '4.2.0', provenance: 'partial' });
  });

  it('uses legacy config evidence as the checkpoint', () => {
    install('4.2.0');

    expect(written(record({ legacyShape: true }))).toMatchObject({ blueprint: '3.2.0' });
  });

  it('skips recording when no checkpoint can be proven', () => {
    expect(record()).toEqual({ status: 'skipped', reason: 'unproven-checkpoint' });
  });

  it('skips recording while a pending upgrade lost its state file', () => {
    install('4.2.0');
    fs.writeFileSync(path.join(root, UPGRADE_PLAYBOOK_FILE), '# pending\n');

    expect(UPGRADE_PLAYBOOK_FILE).toBe('blueprint-upgrade.md');
    expect(record()).toEqual({ status: 'skipped', reason: 'pending-upgrade' });
  });

  it('merges into existing state, forgetting removed paths '
    + 'and preserving other applications', () => {
    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), serializeLifecycleState({
      schema: 1,
      blueprint: '4.1.0',
      provenance: 'complete',
      operations: ['done'],
      pending: null,
      applications: {
        'apps/api': { provenance: [{ kind: 'generated', path: 'CLAUDE.md' }] },
        'apps/web': { provenance: [{ kind: 'generated', path: 'GEMINI.md' }] },
      },
    }));

    const outcome = record({
      applicationRoot: path.join(root, 'apps/web'),
      applied: [{ kind: 'rm', path: 'GEMINI.md' }, { kind: 'install', dependencies: ['eslint'] }],
    });

    expect(outcome).toMatchObject({ established: null });

    expect(written(outcome)).toMatchObject({
      operations: ['done'],
      applications: {
        'apps/api': { provenance: [{ kind: 'generated', path: 'CLAUDE.md' }] },
        'apps/web': { provenance: [{ kind: 'dependency', name: 'eslint' }] },
      },
    });
  });

  it('reports an unreadable lifecycle state and nothing else', () => {
    expect(lifecycleStateProblem(root)).toBeNull();

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), '{"schema":1}');
    expect(lifecycleStateProblem(root)).toBe('blueprint');
  });
});
