import path from 'node:path';

import type { Action } from './types';

/**
 * Does this path leave the project root?
 *
 * Judged on the string, so it needs no root to compare against: a path escapes
 * exactly when it is absolute, or when normalising it leaves a leading `..`.
 * That is what lets `plan` refuse before `apply` has a root in hand — and
 * refusing in the planner is the difference between "nothing landed" and "the
 * four actions above the bad one landed".
 *
 * Two portability details, both of which decide something:
 *
 * - **Backslashes are folded to `/` first.** On posix `path.normalize` does not
 *   treat `\` as a separator, so `..\outside` normalises to itself — one segment
 *   that starts with `..` but is not `..` and does not start with `../`. It would
 *   pass here and escape on Windows, where the whole check runs on a machine that
 *   cannot see the bug. Same reason `scan` normalises separators at birth.
 * - **Both `isAbsolute` variants are asked.** `path.isAbsolute` is
 *   platform-specific, so `C:\out` and `\out` answer false under posix. Judging a
 *   path by the platform that happens to be running is not a boundary; a config
 *   is portable, and so is this.
 */
export function escapesRoot(target: string): boolean {
  if (path.isAbsolute(target) || path.win32.isAbsolute(target)) return true;

  const normalized = path.posix.normalize(target.split('\\').join('/'));

  return normalized === '..' || normalized.startsWith('../');
}

/**
 * Refuse an action list that would touch anything outside the project root.
 *
 * `SECURITY.md` puts "anything outside the project root" in scope as a
 * vulnerability, and `emit.handbook` / `emit.agents[].path` are adopter-supplied
 * strings that reach `fs` unchecked — `../CLAUDE.md` wrote one directory up, an
 * absolute path wrote wherever it pointed, and the run reported success. The
 * config is executable JavaScript, so this is not a privilege boundary; it is the
 * promise that a wrong relative path in a config an agent authored fails loudly
 * instead of scattering files through the parent directory.
 *
 * Called by `plan` (which makes the refusal atomic — the whole run is rejected
 * before a single write) and again at the top of `apply`, because `apply` is the
 * last thing between an action list and the filesystem however that list was
 * built. Membership is `'path' in action` rather than a list of kinds, so an
 * action kind added later is covered the day it is added.
 */
export function assertContained(actions: Action[]): void {
  for (const action of actions) {
    if ('path' in action && escapesRoot(action.path)) {
      throw new Error(
        `Refused "${action.path}" (${action.kind}) — it resolves outside the project root, `
        + 'and init only ever writes inside the repo it runs in, so nothing was written. '
        + 'Every path is relative to the project root: no leading "../", no absolute path, '
        + 'no drive letter. The config fields that set one are `emit.handbook` and '
        + '`emit.agents[].path`.',
      );
    }
  }
}
