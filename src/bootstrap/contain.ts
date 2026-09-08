import path from 'node:path';

import type { Action } from './types';

export function escapesRoot(target: string): boolean {
  if (path.isAbsolute(target) || path.win32.isAbsolute(target)) {
    return true;
  }

  const normalized = path.posix.normalize(target.split('\\').join('/'));

  return normalized === '..' || normalized.startsWith('../');
}

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
