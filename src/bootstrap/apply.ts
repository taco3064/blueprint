import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { Action } from './types';

/** The one injected effect — installing dependencies. Overridable in tests. */
export type Exec = (command: string, cwd: string) => void;

/* v8 ignore start -- real installer, not run in unit tests (exec is injected) */
export const defaultExec: Exec = (command, cwd) => {
  execSync(command, { cwd, stdio: 'inherit' });
};
/* v8 ignore stop */

/** Execute the planned actions against the filesystem. */
export function apply(root: string, actions: Action[], exec: Exec = defaultExec): void {
  for (const action of actions) {
    if (action.kind === 'write') {
      const full = path.resolve(root, action.path);

      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, action.content);
    } else if (action.kind === 'mkdir') {
      const full = path.resolve(root, action.path);

      fs.mkdirSync(full, { recursive: true });
      fs.writeFileSync(path.join(full, '.gitkeep'), '');
    } else if (action.kind === 'install') {
      exec(action.command, root);
    } else if (action.kind === 'rm') {
      // Only ever pointed at init's own output (e.g. a pristine preset
      // scaffold that --authoring takes over) — never at user files.
      fs.rmSync(path.resolve(root, action.path), { force: true });
    }
    // 'instruct' actions are report-only.
  }
}
