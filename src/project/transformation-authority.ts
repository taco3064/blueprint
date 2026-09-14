import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { renderTransformationObligationError } from '../operational-contract';
import { relativeFilesystemPath } from './context';
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

  const application = relativeFilesystemPath(repository.stdout.trim(), root);
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

  if (!value || !['pending', 'completed'].includes(value.status) || !value.obligation) {
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
