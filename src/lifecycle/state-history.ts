import { defaultGitReader } from '../project';
import type { GitReader } from '../project';
import { LIFECYCLE_FILE } from './state';

/**
 * Whether any commit reachable from a ref of the repository contains lifecycle state.
 * `never-recorded` rules out only reachable history, not a commit Git no longer shows.
 *
 * Only `recorded` state carries history authority: missing, it is lost and must be restored.
 * `never-recorded` cannot tell a pre-lifecycle adoption whose package was updated past
 * `LIFECYCLE_SINCE` from a lifecycle-aware adoption that never committed the file and then
 * deleted it; neither proves a lifecycle ever existed, so both fall back to the pre-lifecycle
 * bootstrap from provable facts. `unknown` proves nothing and fails closed like `recorded`, and
 * neither `recorded` nor `unknown` lets a legacy config shape date the source instead.
 */
export type LifecycleStateHistory = 'recorded' | 'never-recorded' | 'unknown';

export function lifecycleStateHistory(
  root: string,
  git: GitReader = defaultGitReader,
): LifecycleStateHistory {
  const shallow = git(['rev-parse', '--is-shallow-repository'], root);

  if (shallow.status !== 0 || shallow.error || shallow.stdout.trim() !== 'false') {
    return 'unknown';
  }

  const commits = git(['rev-list', '--all', '--full-history', '-1', '--', LIFECYCLE_FILE], root);

  if (commits.status !== 0 || commits.error) {
    return 'unknown';
  }

  return commits.stdout.trim() ? 'recorded' : 'never-recorded';
}
