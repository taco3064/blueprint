import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { runInspect } from '../inspect';
import type { Finding } from '../inspect';

export interface GitReadResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type GitReader = (args: string[], cwd: string) => GitReadResult;

export type PreflightInspector = (
  applicationRoot: string,
) => Promise<{ findings: Finding[] }>;

export interface TransformationPreflightEffects {
  git?: GitReader;
  inspect?: PreflightInspector;
}

export interface PreflightCheck {
  ok: boolean;
  reason?: string;
}

export interface TransformationPreflight {
  ok: boolean;
  repository: PreflightCheck & { root?: string };
  worktree: PreflightCheck & { changes?: string[] };
  head: PreflightCheck & { commit?: string };
  scope: PreflightCheck & { selected?: string };
  inspection: PreflightCheck & { findings?: Finding[] };
}

const defaultGitReader: GitReader = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error ? { error: result.error } : {}),
  };
};

const defaultInspector: PreflightInspector = async (applicationRoot) =>
  runInspect(applicationRoot, { log: () => {} });

export async function runTransformationPreflight(
  root: string,
  selectedScopes: string[],
  effects: TransformationPreflightEffects = {},
): Promise<TransformationPreflight> {
  const scope = selectApplication(selectedScopes);

  if (!scope.ok || scope.selected === undefined) {
    return unavailablePreflight(scope);
  }

  const git = effects.git ?? defaultGitReader;
  const applicationRoot = path.resolve(root);
  const repository = repositoryCheck(git, applicationRoot);

  const worktree = repository.ok
    ? worktreeCheck(git, applicationRoot)
    : unavailable('Worktree cleanliness cannot be checked outside a Git worktree.');

  const head = repository.ok
    ? headCheck(git, applicationRoot)
    : unavailable('A recoverable HEAD cannot be checked outside a Git worktree.');

  const inspection = await inspectionCheck(effects.inspect ?? defaultInspector, applicationRoot);
  const checks = [repository, worktree, head, scope, inspection];

  return { ok: checks.every((check) => check.ok), repository, worktree, head, scope, inspection };
}

function selectApplication(selectedScopes: string[]): TransformationPreflight['scope'] {
  if (selectedScopes.length !== 1) {
    return unavailable(
      `Exactly one application scope must be selected; received ${selectedScopes.length}.`,
    );
  }

  return { ok: true, selected: selectedScopes[0] };
}

function unavailablePreflight(
  scope: TransformationPreflight['scope'],
): TransformationPreflight {
  return {
    ok: false,
    repository: unavailable('Git repository membership requires one selected application.'),
    worktree: unavailable('Worktree cleanliness requires one selected application.'),
    head: unavailable('A recoverable HEAD requires one selected application.'),
    scope,
    inspection: unavailable('Inspection requires one selected application.'),
  };
}

function repositoryCheck(
  git: GitReader,
  applicationRoot: string,
): TransformationPreflight['repository'] {
  const inside = git(['rev-parse', '--is-inside-work-tree'], applicationRoot);

  if (!succeeded(inside) || inside.stdout.trim() !== 'true') {
    return unavailable(gitFailure(
      inside,
      'The selected application is not inside a Git worktree.',
    ));
  }

  const top = git(['rev-parse', '--show-toplevel'], applicationRoot);

  return succeeded(top) && top.stdout.trim()
    ? { ok: true, root: top.stdout.trim() }
    : unavailable(gitFailure(top, 'The Git worktree root could not be resolved.'));
}

function worktreeCheck(
  git: GitReader,
  applicationRoot: string,
): TransformationPreflight['worktree'] {
  const result = git([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
    '--',
    '.',
  ], applicationRoot);

  if (!succeeded(result)) {
    return unavailable(gitFailure(result, 'Git worktree status could not be read.'));
  }

  const changes = result.stdout.split('\n').filter(Boolean);

  return changes.length
    ? { ok: false, changes, reason: 'The selected application has uncommitted changes.' }
    : { ok: true, changes: [] };
}

function headCheck(
  git: GitReader,
  applicationRoot: string,
): TransformationPreflight['head'] {
  const result = git(['rev-parse', '--verify', 'HEAD^{commit}'], applicationRoot);
  const commit = result.stdout.trim();

  return succeeded(result) && commit
    ? { ok: true, commit }
    : unavailable(gitFailure(result, 'No committed, recoverable HEAD exists.'));
}

async function inspectionCheck(
  inspect: PreflightInspector,
  applicationRoot: string,
): Promise<TransformationPreflight['inspection']> {
  try {
    const result = await inspect(applicationRoot);

    return { ok: true, findings: result.findings };
  } catch (error) {
    return unavailable(`Pre-transform inspection could not produce usable evidence: ${message(error)}`);
  }
}

function succeeded(result: GitReadResult): boolean {
  return result.status === 0 && result.error === undefined;
}

function gitFailure(result: GitReadResult, fallback: string): string {
  return result.error?.message || result.stderr.trim() || fallback;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(reason: string): PreflightCheck {
  return { ok: false, reason };
}
