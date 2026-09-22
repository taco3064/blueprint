import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { assertContained } from './contain';
import type { Action } from './types';
import { renderDestructiveActionFailure } from '../operational-contract';

export type Exec = (command: string, cwd: string) => void;

/* v8 ignore start -- real installer, not run in unit tests (exec is injected) */
export const defaultExec: Exec = (command, cwd) => {
  execSync(command, { cwd, stdio: 'inherit' });
};
/* v8 ignore stop */

export interface ApplyEffects {

  exec: Exec;

  onApplied: (action: Action) => void;

  onInstallStarting?: (action: Action & { kind: 'install' }) => void;

  remove?: (target: string) => void;
}

export function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function applyAction(root: string, action: Action, effects: ApplyEffects): void {
  if (action.kind === 'write') {
    const full = path.resolve(root, action.path);

    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, action.content);
  } else if (action.kind === 'mkdir') {
    const full = path.resolve(root, action.path);

    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, '.gitkeep'), '');
  } else if (action.kind === 'install') {
    effects.exec(action.command, action.cwd ?? root);
  } else if (action.kind === 'rm') {
    const full = path.resolve(root, action.path);

    (effects.remove ?? ((target: string) => fs.rmSync(target, { force: true })))(full);

    if (pathExists(full)) {
      throw new Error(renderDestructiveActionFailure(action.path));
    }
  }
}

export function apply(root: string, actions: Action[], effects: ApplyEffects): void {
  assertContained(actions);

  for (const action of actions) {
    if (action.kind === 'install') {
      effects.onInstallStarting?.(action);
    }

    applyAction(root, action, effects);
    effects.onApplied(action);
  }
}
