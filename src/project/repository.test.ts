import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReadResult } from './repository';
import { canonicalPath, resolveRepositoryContext } from './repository';

const result = (overrides: Partial<GitReadResult> = {}): GitReadResult => ({
  status: 0,
  stdout: '',
  stderr: '',
  ...overrides,
});

let root: string;

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-repository-')));
});

afterEach(() => {
  fs.rmSync(`${root}-link`, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

describe('canonicalPath', () => {
  it('spells an existing directory by its physical path however it is reached', () => {
    fs.symlinkSync(root, `${root}-link`, 'junction');

    for (const spelling of [
      `${root}-link`,
      `${root}${path.sep}`,
      `${root}${path.sep}.`,
      root.split(path.sep).join('/'),
      path.relative(process.cwd(), root),
    ]) {
      expect(canonicalPath(spelling), spelling).toBe(root);
    }
  });

  it('resolves a path that does not exist without touching it', () => {
    const missing = path.join(root, 'missing');

    expect(canonicalPath(`${missing}${path.sep}`)).toBe(missing);
    expect(canonicalPath('missing')).toBe(path.resolve('missing'));
  });
});

describe('resolveRepositoryContext', () => {
  it('resolves and trims the containing worktree root', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: '/repo/root\n' }));

    expect(resolveRepositoryContext('/repo/root/apps/web', git)).toEqual({
      ok: true,
      root: path.resolve('/repo/root'),
    });

    expect(git.mock.calls).toEqual([
      [['rev-parse', '--is-inside-work-tree'], '/repo/root/apps/web'],
      [['rev-parse', '--show-toplevel'], '/repo/root/apps/web'],
    ]);
  });

  it('spells the root the way Node spells the same directory', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: `${root.split(path.sep).join('/')}/\n` }));

    expect(resolveRepositoryContext(root, git)).toEqual({ ok: true, root });
  });

  it('explains an application outside Git without asking for the top level', () => {
    const git = vi.fn().mockReturnValue(result({ status: 128, stderr: 'not a repository\n' }));

    expect(resolveRepositoryContext('/app', git)).toEqual({
      ok: false,
      reason: 'not a repository',
    });

    expect(git).toHaveBeenCalledTimes(1);
  });

  it('uses process errors and fallbacks when Git cannot identify a worktree', () => {
    const error = new Error('git unavailable');

    expect(resolveRepositoryContext('/app', () => result({ error }))).toEqual({
      ok: false,
      reason: 'git unavailable',
    });

    expect(resolveRepositoryContext('/app', () => result({ stdout: 'false' }))).toEqual({
      ok: false,
      reason: 'The selected application is not inside a Git worktree.',
    });
  });

  it('rejects an empty or failed top-level response', () => {
    const empty = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true' }))
      .mockReturnValueOnce(result());

    expect(resolveRepositoryContext('/app', empty)).toEqual({
      ok: false,
      reason: 'The Git worktree root could not be resolved.',
    });

    const failed = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true' }))
      .mockReturnValueOnce(result({ status: 1, stderr: 'denied' }));

    expect(resolveRepositoryContext('/app', failed)).toEqual({ ok: false, reason: 'denied' });
  });
});
