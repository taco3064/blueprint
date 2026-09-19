import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GitReader } from '../project';
import { runningPackage } from './package';
import {
  applicationKey,
  lifecycleStateProblem,
  lostLifecycleState,
  recordAdoption,
  UPGRADE_PLAYBOOK_FILE,
} from './record';
import type { RecordAdoptionInput } from './record';
import { LIFECYCLE_FILE, serializeLifecycleState } from './state';

let root: string;

const history = (commits: string): GitReader => (args) => ({
  status: 0,
  stdout: args[0] === 'rev-parse' ? 'false\n' : commits,
  stderr: '',
});

const recorded = history('abc\n');
const neverRecorded = history('');

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
    finished: true,
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

    expect(outcome).toMatchObject({ status: 'write', established: 'first' });

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
});

describe('recordAdoption · missing and unfinished checkpoints', () => {
  it('refuses to rebuild the state a lifecycle-aware release should have written', () => {
    install('4.2.0');

    expect(record({ git: recorded })).toEqual({ status: 'skipped', reason: 'missing-state' });
    expect(record()).toEqual({ status: 'skipped', reason: 'missing-state' });
  });

  it('bootstraps from the installed package when state never entered Git history', () => {
    install('4.2.0');

    const outcome = record({ git: neverRecorded });

    expect(outcome).toMatchObject({ established: 'bootstrap' });
    expect(written(outcome)).toMatchObject({ blueprint: '4.2.0', provenance: 'partial' });
  });

  it('records what an unfinished first adoption wrote without claiming a checkpoint', () => {
    const outcome = record({ firstAdoption: true, finished: false });

    expect(outcome).toMatchObject({ established: 'records-only' });

    expect(written(outcome)).toMatchObject({
      blueprint: null,
      provenance: 'complete',
      applications: { '.': { provenance: [{ kind: 'directory', path: 'src/pages' }] } },
    });

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), (outcome as { content: string }).content);

    const finished = record({ applied: [{ kind: 'mkdir', path: 'src/hooks' }] });

    expect(finished).toMatchObject({ established: 'first' });

    expect(written(finished)).toMatchObject({
      blueprint: '4.1.0',
      applications: {
        '.': {
          provenance: [
            { kind: 'directory', path: 'src/pages' },
            { kind: 'directory', path: 'src/hooks' },
          ],
        },
      },
    });
  });

  it('leaves an unfinished adoption unestablished until a run finishes', () => {
    const records = record({ firstAdoption: true, finished: false });

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), (records as { content: string }).content);

    const again = record({ finished: false });

    expect(again).toMatchObject({ established: 'records-only' });
    expect(written(again)).toMatchObject({ blueprint: null });

    const unnamed = record({ runningVersion: null });

    expect(unnamed).toMatchObject({ established: 'records-only' });
    expect(written(unnamed)).toMatchObject({ blueprint: null });

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), (record() as { content: string }).content);

    expect(record()).toMatchObject({ established: null });
  });
});

describe('lostLifecycleState', () => {
  it('proves lost state from any adopted application in the repository', () => {
    const adopt = (app: string, version: string | null) => {
      const dir = path.join(root, app);

      fs.mkdirSync(path.join(dir, 'node_modules/@kekkai/blueprint'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'blueprint.config.mjs'), 'export default {};\n');

      if (version !== null) {
        fs.writeFileSync(
          path.join(dir, 'node_modules/@kekkai/blueprint/package.json'),
          JSON.stringify({ name: '@kekkai/blueprint', version }),
        );
      }
    };

    expect(lostLifecycleState(root)).toBeNull();

    adopt('apps/a', '4.2.0');
    adopt('apps/b', '4.1.0');
    adopt('apps/c', '4.0.0');
    adopt('apps/d', null);

    expect(lostLifecycleState(root)).toBe('4.2.0');
    expect(lostLifecycleState(root, recorded)).toBe('4.2.0');
    expect(lostLifecycleState(root, neverRecorded)).toBeNull();

    fs.writeFileSync(path.join(root, LIFECYCLE_FILE), serializeLifecycleState({
      schema: 1, blueprint: '4.2.0', provenance: 'complete', operations: [], pending: null,
      applications: {},
    }));

    expect(lostLifecycleState(root)).toBeNull();
  });

  it('treats older installs alone as a pre-lifecycle repository without asking Git', () => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};\n');
    install('4.0.0');

    const asked: string[][] = [];

    expect(lostLifecycleState(root, (args) => {
      asked.push(args);

      return recorded(args, root);
    })).toBeNull();

    expect(asked).toEqual([]);
  });
});

describe('recordAdoption · checkpoints and merging', () => {
  it('uses legacy config evidence as the checkpoint only when no state entered Git', () => {
    install('4.2.0');

    expect(written(record({ legacyShape: true, git: neverRecorded })))
      .toMatchObject({ blueprint: '3.2.0' });

    expect(record({ legacyShape: true, git: recorded }))
      .toEqual({ status: 'skipped', reason: 'missing-state' });

    expect(record({ legacyShape: true }))
      .toEqual({ status: 'skipped', reason: 'missing-state' });
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
