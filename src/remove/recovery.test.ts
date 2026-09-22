import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReader } from '../project';
import type { ApplyContext } from './apply';
import {
  captureRemovalRecoveryAuthority,
  planPostUninstallRecovery,
} from './recovery';
import type { RemovalAction } from './types';

let root: string;
let refs: Record<string, string>;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-recovery-')));
  refs = {};
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

const git: GitReader = (args) => {
  const oid = refs[args[2]];

  return {
    status: 0,
    stdout: args[0] !== 'for-each-ref' || !oid
      ? ''
      : `${args[1] === '--format=%(refname)' ? args[2] : oid}\n`,
    stderr: '',
  };
};

function context(): ApplyContext {
  return { root, boundaries: [root], git, log: () => {} };
}

describe('post-uninstall removal recovery authority', () => {
  it('replays an exact file and directory tree but rejects adjacent divergent content', () => {
    write('blueprint.config.mjs', 'export default {};\n');
    write('src/pages/.gitkeep', '');

    const actions: RemovalAction[] = [
      { kind: 'delete', path: 'blueprint.config.mjs', reason: 'config' },
      { kind: 'rmdir', path: 'src/pages', reason: 'directory' },
    ];

    const authority = captureRemovalRecoveryAuthority(actions, context());

    expect(authority.entries[1]?.before).toMatchObject({
      kind: 'directory',
      entries: [{
        name: '.gitkeep',
        state: { kind: 'file', content: '' },
      }],
    });

    fs.rmSync(path.join(root, 'blueprint.config.mjs'));
    fs.rmSync(path.join(root, 'src/pages'), { recursive: true });
    write('blueprint.config.mjs', 'export default {};\n');
    write('src/pages/.gitkeep', '');

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions,
      conflicts: [],
    });

    write('src/pages/user.ts', 'export {};\n');

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [],
      conflicts: ['src/pages changed after dependency uninstall'],
    });
  });

  it('canonicalizes directory entry order in captured authority', () => {
    write('src/pages/a.ts', 'a');
    write('src/pages/b.ts', 'b');

    const original = fs.readdirSync;

    const readInReverse = (target: fs.PathLike) => {
      if (target.toString().endsWith(path.join('src', 'pages'))) {
        return ['b.ts', 'a.ts'];
      }

      return original(target);
    };

    const readdir = vi.spyOn(fs, 'readdirSync').mockImplementation(readInReverse as never);

    const action: RemovalAction = { kind: 'rmdir', path: 'src/pages', reason: 'directory' };
    const authority = captureRemovalRecoveryAuthority([action], context());

    expect(authority.entries[0]?.before).toMatchObject({
      kind: 'directory',
      entries: [{ name: 'a.ts' }, { name: 'b.ts' }],
    });

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [action], conflicts: [],
    });

    readdir.mockRestore();
  });

  it('does not authorize a target that was absent before removal', () => {
    const actions: RemovalAction[] = [{
      kind: 'delete', path: 'blueprint.config.mjs', reason: 'config',
    }];

    const authority = captureRemovalRecoveryAuthority(actions, context());

    write('blueprint.config.mjs', 'new user file\n');

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [],
      conflicts: ['blueprint.config.mjs changed after dependency uninstall'],
    });
  });
});

describe('post-uninstall filesystem identity', () => {
  it('requires an exact symbolic-link target', () => {
    const link = path.join(root, 'blueprint.config.mjs');

    const action: RemovalAction = {
      kind: 'delete', path: 'blueprint.config.mjs', reason: 'config',
    };

    fs.symlinkSync('original.mjs', link);
    const linkAuthority = captureRemovalRecoveryAuthority([action], context());

    fs.rmSync(link);
    fs.symlinkSync('original.mjs', link);

    expect(planPostUninstallRecovery(linkAuthority, context())).toEqual({
      actions: [action], conflicts: [],
    });

    fs.rmSync(link);
    fs.symlinkSync('user-owned.mjs', link);

    expect(planPostUninstallRecovery(linkAuthority, context())).toEqual({
      actions: [],
      conflicts: ['blueprint.config.mjs changed after dependency uninstall'],
    });
  });

  it('requires the same filesystem mode', () => {
    const file = path.join(root, 'blueprint.config.mjs');

    const action: RemovalAction = {
      kind: 'delete', path: 'blueprint.config.mjs', reason: 'config',
    };

    write('blueprint.config.mjs', 'same bytes\n');
    const fileAuthority = captureRemovalRecoveryAuthority([action], context());
    const stat = fs.lstatSync(file);
    const changedMode = Object.create(stat) as fs.Stats;

    Object.defineProperty(changedMode, 'mode', { value: stat.mode ^ 1 });
    const lstat = vi.spyOn(fs, 'lstatSync').mockReturnValue(changedMode);

    expect(planPostUninstallRecovery(fileAuthority, context())).toEqual({
      actions: [],
      conflicts: ['blueprint.config.mjs changed after dependency uninstall'],
    });

    lstat.mockRestore();
  });

  it('fails closed on unreadable and unsupported original targets', () => {
    const action: RemovalAction = { kind: 'delete', path: 'blocked', reason: 'generated' };
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });

    const lstat = vi.spyOn(fs, 'lstatSync').mockImplementationOnce(() => {
      throw denied;
    });

    expect(() => captureRemovalRecoveryAuthority([action], context())).toThrow(denied);
    lstat.mockRestore();

    const unknown = {
      mode: 0o644,
      isFile: () => false,
      isSymbolicLink: () => false,
      isDirectory: () => false,
    } as fs.Stats;

    const unsupported = vi.spyOn(fs, 'lstatSync').mockReturnValue(unknown);
    const authority = captureRemovalRecoveryAuthority([action], context());

    expect(authority.entries[0]?.before).toEqual({ kind: 'other', mode: 0o644 });

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [], conflicts: ['blocked changed after dependency uninstall'],
    });

    unsupported.mockRestore();
  });
});

describe('post-uninstall rewrite and ref recovery', () => {
  it('replays a planned rewrite only from its original or absent state', () => {
    write('.blueprint-lifecycle.json', 'before');

    const action: RemovalAction = {
      kind: 'write', path: '.blueprint-lifecycle.json', content: 'after',
      reason: 'lifecycle-state',
    };

    const authority = captureRemovalRecoveryAuthority([action], context());

    write('.blueprint-lifecycle.json', 'after');
    expect(planPostUninstallRecovery(authority, context())).toEqual({ actions: [], conflicts: [] });

    write('.blueprint-lifecycle.json', 'before');

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [action], conflicts: [],
    });

    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [action], conflicts: [],
    });

    write('.blueprint-lifecycle.json', 'user-owned');

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [],
      conflicts: ['.blueprint-lifecycle.json changed after dependency uninstall'],
    });
  });

  it('replays only the same Git ref target', () => {
    const ref = 'refs/blueprint/transformations/abc';
    const action: RemovalAction = { kind: 'ref', ref, application: '.' };

    refs[ref] = 'original';
    const authority = captureRemovalRecoveryAuthority([action], context());

    expect(authority.entries[0]?.before).toEqual({ kind: 'present', oid: 'original' });

    delete refs[ref];
    expect(planPostUninstallRecovery(authority, context())).toEqual({ actions: [], conflicts: [] });

    refs[ref] = 'original';

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [action], conflicts: [],
    });

    refs[ref] = 'different';

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [],
      conflicts: [`Git ref ${ref} changed after dependency uninstall`],
    });
  });

  it('fails closed when Git ref verification degrades or began absent', () => {
    const ref = 'refs/blueprint/transformations/abc';
    const action: RemovalAction = { kind: 'ref', ref, application: '.' };

    refs[ref] = 'original';
    const authority = captureRemovalRecoveryAuthority([action], context());

    const unavailable: ApplyContext = {
      ...context(), git: () => ({ status: 1, stdout: 'original\n', stderr: 'unavailable' }),
    };

    expect(planPostUninstallRecovery(authority, unavailable)).toEqual({
      actions: [],
      conflicts: [`Git ref ${ref} changed after dependency uninstall`],
    });

    const unverifiedAuthority = captureRemovalRecoveryAuthority([action], unavailable);

    expect(unverifiedAuthority.entries[0]?.before).toEqual({ kind: 'unverified' });

    expect(planPostUninstallRecovery(unverifiedAuthority, unavailable)).toEqual({
      actions: [],
      conflicts: [`Git ref ${ref} changed after dependency uninstall`],
    });

    delete refs[ref];
    const absentAuthority = captureRemovalRecoveryAuthority([action], context());

    expect(absentAuthority.entries[0]?.before).toEqual({ kind: 'absent' });

    refs[ref] = 'new';

    expect(planPostUninstallRecovery(absentAuthority, context())).toEqual({
      actions: [],
      conflicts: [`Git ref ${ref} changed after dependency uninstall`],
    });
  });

  it('normalizes insignificant whitespace around a Git object id', () => {
    const ref = 'refs/blueprint/transformations/abc';
    const action: RemovalAction = { kind: 'ref', ref, application: '.' };

    refs[ref] = 'original';

    const padded: ApplyContext = {
      ...context(),
      git: (args, cwd) => args[1] === '--format=%(objectname)'
        ? { status: 0, stdout: '  original  \n', stderr: '' }
        : git(args, cwd),
    };

    const authority = captureRemovalRecoveryAuthority([action], padded);

    expect(authority.entries[0]?.before).toEqual({ kind: 'present', oid: 'original' });

    expect(planPostUninstallRecovery(authority, context())).toEqual({
      actions: [action], conflicts: [],
    });
  });
});
