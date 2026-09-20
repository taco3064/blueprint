import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderTransformationObligationError } from '../operational-contract';
import { relativeFilesystemPath } from './context';
import { isTransformationObligation } from './transformation-obligation';
import type { LayerToModuleObligation } from './transformation-obligation';

interface Authority {
  status: 'pending' | 'completed';
  obligation: LayerToModuleObligation;
}

export type AuthorityGit = (args: string[], cwd: string, input?: string) => {
  status: number | null;
  stdout: string;
};

const git: AuthorityGit = (args, cwd, input) => {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8' });

  return { status: result.status, stdout: result.stdout || '' };
};

function fail(code: string, subject?: string): never {
  throw new Error(renderTransformationObligationError({
    kind: 'incomplete', failures: [{ code, subject }],
  }));
}

function reference(root: string, exec: AuthorityGit): string | null {
  const repository = exec(['rev-parse', '--show-toplevel'], root);

  if (repository.status !== 0) {
    return null;
  }

  const application = relativeFilesystemPath(repository.stdout.trim(), root)
    .split(path.sep).join('/');

  const key = createHash('sha256').update(application).digest('hex');

  return `refs/blueprint/transformations/${key}`;
}

function read(root: string, ref: string, exec: AuthorityGit): Authority | null {
  const refs = exec(['for-each-ref', '--format=%(refname)', ref], root);

  if (refs.status !== 0) {
    return fail('authority-unavailable', ref);
  }

  if (!refs.stdout.split(/\r?\n/).includes(ref)) {
    return null;
  }

  const result = exec(['cat-file', 'blob', ref], root);

  if (result.status !== 0) {
    return fail('authority-unavailable', ref);
  }

  let value: Authority;

  try {
    value = JSON.parse(result.stdout) as Authority;
  } catch /* Stryker disable next-line BlockStatement: fallthrough rejects undefined equally. */ {
    return fail('authority-unavailable', ref);
  }

  if (!value || !['pending', 'completed'].includes(value.status)
    || !isTransformationObligation(value.obligation)) {
    return fail('authority-unavailable', ref);
  }

  return value;
}

export function assertTransformationAuthority(
  root: string,
  obligation: LayerToModuleObligation | null,
  exec: AuthorityGit = git,
): void {
  const ref = reference(root, exec);

  if (!ref) {
    if (obligation) {
      fail('authority-unavailable');
    }

    return;
  }

  const authority = read(root, ref, exec);

  if (!authority || (authority.status === 'completed' && !obligation)) {
    if (obligation) {
      fail('authority-missing', ref);
    }

    return;
  }

  if (!obligation) {
    fail('authority-missing', ref);
  }

  if (JSON.stringify(authority.obligation.origin) !== JSON.stringify(obligation.origin)
    || (authority.status === 'completed'
      && JSON.stringify(authority.obligation.target) !== JSON.stringify(obligation.target))) {
    fail('authority-origin-changed', ref);
  }
}

export function writeTransformationAuthority(
  root: string,
  obligation: LayerToModuleObligation,
  options: { status: Authority['status']; git?: AuthorityGit },
): void {
  const { status, git: exec = git } = options;
  const ref = reference(root, exec);

  if (!ref) {
    fail('authority-unavailable');
  }

  const previous = read(root, ref, exec);

  if (status === 'pending' && previous?.status === 'pending') {
    fail('authority-origin-changed', ref);
  }

  if (status === 'completed') {
    assertTransformationAuthority(root, obligation, exec);
  }

  const blob = exec(['hash-object', '-w', '--stdin'], root,
    JSON.stringify({ status, obligation }));

  if (blob.status !== 0 || !blob.stdout.trim()) {
    fail('authority-write-failed', ref);
  }

  if (exec(['update-ref', ref, blob.stdout.trim()], root).status !== 0) {
    fail('authority-write-failed', ref);
  }
}

export function retainedTransformationOrigin(
  root: string,
  exec: AuthorityGit = git,
): LayerToModuleObligation | null {
  const ref = reference(root, exec);
  const authority = ref === null ? null : read(root, ref, exec);

  return authority?.status === 'completed' ? authority.obligation : null;
}

export function recoverTransformationObligation(
  root: string,
  exec: AuthorityGit = git,
): LayerToModuleObligation {
  const ref = reference(root, exec);

  if (!ref) {
    fail('authority-unavailable');
  }

  const authority = read(root, ref, exec);

  if (authority?.status !== 'pending') {
    fail('authority-recovery-unavailable', ref);
  }

  const origin = authority.obligation.origin;
  const repository = exec(['rev-parse', '--show-toplevel'], root);
  const head = exec(['rev-parse', 'HEAD'], root);

  if (repository.status !== 0 || head.status !== 0 || head.stdout.trim() !== origin.head) {
    fail('authority-recovery-head', ref);
  }

  const application = relativeFilesystemPath(repository.stdout.trim(), root)
    .split(path.sep).join('/') || '.';

  if (origin.applicationRoot !== application
    || !safeRecoveryPaths([origin.sourceRoot, origin.selectedScope,
      ...origin.sources.flatMap((source) => source.members)])) {
    fail('authority-recovery-scope', ref);
  }

  return authority.obligation;
}

function safeRecoveryPaths(paths: string[]): boolean {
  return paths.every((value) => value !== '' && !value.includes('\\')
    && !path.posix.isAbsolute(value) && !path.win32.parse(value).root
    && !value.split('/').includes('..'));
}

export function writeTransformationAuthorities(
  repositoryRoot: string,
  applications: { root: string; obligation: LayerToModuleObligation }[],
  exec: AuthorityGit = git,
): void {
  const updates = applications.map(({ root, obligation }) => {
    const ref = reference(root, exec);

    if (!ref) {
      fail('authority-unavailable');
    }

    if (read(root, ref, exec)?.status === 'pending') {
      fail('authority-origin-changed', ref);
    }

    const blob = exec(['hash-object', '-w', '--stdin'], root,
      JSON.stringify({ status: 'pending', obligation }));

    if (blob.status !== 0 || !blob.stdout.trim()) {
      fail('authority-write-failed', ref);
    }

    return `update ${ref} ${blob.stdout.trim()}`;
  });

  const transaction = ['start', ...updates, 'prepare', 'commit', ''].join('\n');

  if (exec(['update-ref', '--stdin'], repositoryRoot, transaction).status !== 0) {
    fail('authority-write-failed');
  }
}
