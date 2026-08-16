import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { assertContained } from './contain';
import type { Action } from './types';

/** The one injected effect — installing dependencies. Overridable in tests. */
export type Exec = (command: string, cwd: string) => void;

/* v8 ignore start -- real installer, not run in unit tests (exec is injected) */
export const defaultExec: Exec = (command, cwd) => {
  execSync(command, { cwd, stdio: 'inherit' });
};
/* v8 ignore stop */

/** The three effects `apply` is handed — nothing here is computed from the plan. */
export interface ApplyEffects {
  /** Dependency install runner. */
  exec: Exec;
  /** Called after each action lands. */
  onApplied: (action: Action) => void;
  /** Called before the install action starts, while it is still running. */
  onInstallStarting?: (action: Action & { kind: 'install' }) => void;
}

/**
 * Execute the planned actions against the filesystem, in order, calling
 * `onApplied` after each one lands. The callback is how the caller narrates
 * effects that have ALREADY happened: an action list announced up front is a
 * promise, and `apply` stops at the first throw, so a run whose install fails
 * mid-list would have claimed every write below it (field issue #37).
 *
 * `onInstallStarting` is the one exception, and it exists because after-the-fact
 * narration has a blind spot exactly where the wait is: every other action here is
 * a local file operation that returns in microseconds, while the install spawns a
 * package manager that can sit for minutes — or forever, on a machine that cannot
 * reach the registry. Two codex runs read that silence as a hung tool and killed it
 * (field runs #131, #132). Announcing a step that is ABOUT to run is not the claim
 * #37 forbade; claiming one that already ran is.
 */
export function apply(root: string, actions: Action[], effects: ApplyEffects): void {
  const { exec, onApplied, onInstallStarting } = effects;

  // Before the loop, not inside it: `apply` is the last boundary between an action
  // list and the filesystem, and a refusal halfway down has already written half
  // the list. `plan` checks too — this one holds for a list built any other way.
  assertContained(actions);

  for (const action of actions) {
    if (action.kind === 'install') {
      onInstallStarting?.(action);
    }

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
    // 'instruct' actions are report-only — still announced, in plan order.

    onApplied(action);
  }
}
