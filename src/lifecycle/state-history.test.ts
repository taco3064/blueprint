import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GitReader, GitReadResult } from '../project';
import { lifecycleStateHistory } from './state-history';

const ok = (stdout: string): GitReadResult => ({ status: 0, stdout, stderr: '' });

function reader(answers: { shallow: GitReadResult; commits?: GitReadResult }): GitReader {
  return (args) => args[0] === 'rev-parse' ? answers.shallow : answers.commits ?? ok('');
}

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-state-history-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

function signed(cwd: string, ...args: string[]): void {
  git(cwd, '-c', 'user.name=Blueprint Test', '-c', 'user.email=blueprint@example.invalid', ...args);
}

function commit(cwd: string, message: string): void {
  git(cwd, 'add', '--all');
  signed(cwd, 'commit', '--quiet', '--allow-empty', '-m', message);
}

function repository(name: string): string {
  const dir = path.join(root, name);

  fs.mkdirSync(dir);
  git(dir, 'init', '--quiet');
  commit(dir, 'baseline');

  return dir;
}

describe('lifecycleStateHistory', () => {
  it('asks every ref of the repository for the lifecycle state file', () => {
    const calls: string[][] = [];

    lifecycleStateHistory(root, (args, cwd) => {
      calls.push([cwd, ...args]);

      return args[0] === 'rev-parse' ? ok('false\n') : ok('');
    });

    expect(calls).toEqual([
      [root, 'rev-parse', '--is-shallow-repository'],
      [root, 'rev-list', '--all', '--full-history', '-1', '--', '.blueprint-lifecycle.json'],
    ]);
  });

  it('reports recorded when any commit contains the state file', () => {
    expect(lifecycleStateHistory(root, reader({ shallow: ok('false\n'), commits: ok('abc\n') })))
      .toBe('recorded');
  });

  it('reports never-recorded only when complete history has no such commit', () => {
    expect(lifecycleStateHistory(root, reader({ shallow: ok('false\n'), commits: ok('\n') })))
      .toBe('never-recorded');
  });

  it('cannot prove absence from a shallow clone or an unreadable shallow check', () => {
    for (const shallow of [
      ok('true\n'),
      ok(''),
      { status: 128, stdout: 'false\n', stderr: 'not a git repository' },
      { status: 0, stdout: 'false\n', stderr: '', error: new Error('spawn git ENOENT') },
    ]) {
      expect(lifecycleStateHistory(root, reader({ shallow })), JSON.stringify(shallow))
        .toBe('unknown');
    }
  });

  it('cannot prove absence when the history walk fails', () => {
    for (const commits of [
      { status: 128, stdout: '', stderr: 'bad revision' },
      { status: 0, stdout: '', stderr: '', error: new Error('spawn git ENOENT') },
    ]) {
      expect(lifecycleStateHistory(root, reader({ shallow: ok('false\n'), commits })))
        .toBe('unknown');
    }
  });

  it('reads real Git: no repository, an unborn one, history without and with the file', () => {
    expect(lifecycleStateHistory(root)).toBe('unknown');

    git(root, 'init', '--quiet');
    expect(lifecycleStateHistory(root)).toBe('never-recorded');

    commit(root, 'baseline');
    expect(lifecycleStateHistory(root)).toBe('never-recorded');

    git(root, 'switch', '--quiet', '-c', 'side');
    fs.writeFileSync(path.join(root, '.blueprint-lifecycle.json'), '{}\n');
    commit(root, 'record lifecycle state');
    git(root, 'switch', '--quiet', '-');

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expect(lifecycleStateHistory(root)).toBe('recorded');
  });

  it('finds state a merged branch recorded and then removed', () => {
    const branched = repository('branched');
    const state = path.join(branched, '.blueprint-lifecycle.json');

    git(branched, 'switch', '--quiet', '-c', 'upgrade');
    fs.writeFileSync(state, '{}\n');
    commit(branched, 'record lifecycle state');
    fs.rmSync(state);
    commit(branched, 'drop lifecycle state');
    git(branched, 'switch', '--quiet', '-');
    signed(branched, 'merge', '--quiet', '--no-ff', '-m', 'merge upgrade', 'upgrade');
    git(branched, 'branch', '--quiet', '-D', 'upgrade');

    expect(lifecycleStateHistory(branched)).toBe('recorded');
  });

  it('finds state that a merge commit dropped', () => {
    const dropped = repository('dropped');

    git(dropped, 'switch', '--quiet', '-c', 'side');
    commit(dropped, 'side work');
    git(dropped, 'switch', '--quiet', '-');
    fs.writeFileSync(path.join(dropped, '.blueprint-lifecycle.json'), '{}\n');
    commit(dropped, 'record lifecycle state');
    signed(dropped, 'merge', '--quiet', '--no-ff', '--no-commit', 'side');
    git(dropped, 'rm', '--quiet', '.blueprint-lifecycle.json');
    signed(dropped, 'commit', '--quiet', '-m', 'merge side without lifecycle state');
    git(dropped, 'branch', '--quiet', '-D', 'side');

    expect(lifecycleStateHistory(dropped)).toBe('recorded');
  });

  it('reads a real shallow clone as unknown even when its visible history lacks the file', () => {
    const origin = path.join(root, 'origin');
    const clone = path.join(root, 'clone');

    fs.mkdirSync(origin);
    git(origin, 'init', '--quiet');
    commit(origin, 'first');
    commit(origin, 'second');
    git(root, 'clone', '--quiet', '--depth', '1', pathToFileURL(origin).href, clone);

    expect(lifecycleStateHistory(clone)).toBe('unknown');
  });
});
