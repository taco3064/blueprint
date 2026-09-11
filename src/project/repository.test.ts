import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import type { GitReadResult } from './repository';
import { resolveRepositoryContext } from './repository';

const result = (overrides: Partial<GitReadResult> = {}): GitReadResult => ({
  status: 0,
  stdout: '',
  stderr: '',
  ...overrides,
});

describe('resolveRepositoryContext', () => {
  it('resolves and trims the containing worktree root', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: '/repo/root\n' }));

    expect(resolveRepositoryContext('/repo/root/apps/web', git)).toEqual({
      ok: true,
      root: '/repo/root',
    });

    expect(git.mock.calls).toEqual([
      [['rev-parse', '--is-inside-work-tree'], '/repo/root/apps/web'],
      [['rev-parse', '--show-toplevel'], '/repo/root/apps/web'],
    ]);
  });

  it('returns the matching caller-side ancestor when Git uses another path spelling', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: '/long/repo\n' }));

    const realpath = vi.spyOn(fs.realpathSync, 'native').mockImplementation((value) =>
      String(value).replace(/^\/short/, '/real').replace(/^\/long/, '/real'));

    expect(resolveRepositoryContext('/short/repo/apps/web', git)).toEqual({
      ok: true,
      root: '/short/repo',
    });

    realpath.mockRestore();
  });

  it('falls back to the resolved Git root when it is not a caller-side ancestor', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: '/other/repo\n' }));

    expect(resolveRepositoryContext('/application', git)).toEqual({
      ok: true,
      root: '/other/repo',
    });
  });

  it('matches canonical Windows paths without case sensitivity', () => {
    const git = vi.fn()
      .mockReturnValueOnce(result({ stdout: 'true\n' }))
      .mockReturnValueOnce(result({ stdout: '/LONG/REPO\n' }));

    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const realpath = vi.spyOn(fs.realpathSync, 'native').mockImplementation((value) =>
      String(value).replace(/^\/short/, '/long'));

    expect(resolveRepositoryContext('/short/repo/apps/web', git)).toEqual({
      ok: true,
      root: '/short/repo',
    });

    realpath.mockRestore();
    platform.mockRestore();
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
