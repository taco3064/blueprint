import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface GitReadResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type GitReader = (args: string[], cwd: string) => GitReadResult;

export interface RepositoryContext {
  ok: boolean;
  root?: string;
  reason?: string;
}

export const defaultGitReader: GitReader = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });

  return {
    status: result.status,
    stdout: result.stdout || String(),
    stderr: result.stderr || String(),
    ...(result.error ? { error: result.error } : {}),
  };
};

export function resolveRepositoryContext(
  applicationRoot: string,
  git: GitReader = defaultGitReader,
): RepositoryContext {
  const inside = git(['rev-parse', '--is-inside-work-tree'], applicationRoot);

  if (!succeeded(inside) || inside.stdout.trim() !== 'true') {
    return unavailable(gitFailure(
      inside,
      'The selected application is not inside a Git worktree.',
    ));
  }

  const top = git(['rev-parse', '--show-toplevel'], applicationRoot);

  return succeeded(top) && top.stdout.trim()
    ? { ok: true, root: matchingAncestor(applicationRoot, top.stdout.trim()) }
    : unavailable(gitFailure(top, 'The Git worktree root could not be resolved.'));
}

function matchingAncestor(applicationRoot: string, gitRoot: string): string {
  const canonicalGitRoot = canonicalPath(gitRoot);
  let current = path.resolve(applicationRoot);

  while (canonicalPath(current) !== canonicalGitRoot) {
    const parent = path.dirname(current);

    if (parent === current) {
      return path.resolve(gitRoot);
    }

    current = parent;
  }

  return current;
}

function canonicalPath(value: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(value);
  } catch {
    resolved = path.resolve(value);
  }

  const normalized = path.normalize(resolved);

  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function succeeded(result: GitReadResult): boolean {
  return result.status === 0 && result.error === undefined;
}

function gitFailure(result: GitReadResult, fallback: string): string {
  return result.error?.message || result.stderr.trim() || fallback;
}

function unavailable(reason: string): RepositoryContext {
  return { ok: false, reason };
}
