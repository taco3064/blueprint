import path from 'node:path';

import type { Action } from './types';
import { renderContainmentRefusal } from '../operational-contract';

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
      throw new Error(renderContainmentRefusal(action.path, action.kind));
    }
  }
}
