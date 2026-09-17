import fs from 'node:fs';
import path from 'node:path';

import {
  LIFECYCLE_FILE,
  lifecycleStateProblem,
  recordAdoption,
} from '../lifecycle';
import type { AppliedAction } from '../lifecycle';
import { findConfigFiles } from '../project';
import type { ProjectState } from '../project';
import {
  renderActionLine,
  renderLifecycleRecordNote,
  renderLifecycleRecordSkipped,
  renderLifecycleStateInvalid,
} from '../operational-contract';
import type { Action } from './types';

const LEGACY_BACKUP = /^blueprint\.config\.mjs\.pre-v4-[0-9a-f]{64}$/;

export interface AdoptionRecorder {
  landed: (action: Action) => void;
  finish: (log: (line: string) => void) => void;
}

export function lifecycleRootOf(state: ProjectState): string {
  return state.repositoryRoot ?? state.applicationRoot;
}

export function assertLifecycleState(state: ProjectState): void {
  const reason = lifecycleStateProblem(lifecycleRootOf(state));

  if (reason !== null) {
    throw new Error(renderLifecycleStateInvalid(LIFECYCLE_FILE, reason));
  }
}

export function logPlannedAdoption(actions: readonly Action[], log: (line: string) => void): void {
  for (const action of actions) {
    log(renderActionLine(action.kind, action.note, 'dry-run'));
  }

  log(renderActionLine('write', renderLifecycleRecordNote(LIFECYCLE_FILE, null), 'dry-run'));
}

function readText(root: string, file: string): string | null {
  try {
    return fs.readFileSync(path.join(root, file), 'utf-8');
  } catch {
    return null;
  }
}

function appliedAction(action: Action, before: Map<string, string | null>): AppliedAction | null {
  switch (action.kind) {
    case 'write':
      return {
        kind: 'write',
        path: action.path,
        content: action.content,
        before: before.get(action.path) ?? null,
        ...(action.ownership ? { ownership: action.ownership } : {}),
      };
    case 'mkdir':
    case 'rm':
      return { kind: action.kind, path: action.path };
    case 'install':
      return { kind: 'install', dependencies: action.dependencies ?? [] };
    default:
      return null;
  }
}

export function adoptionRecorder(
  root: string,
  state: ProjectState,
  actions: readonly Action[],
): AdoptionRecorder {
  const lifecycleRoot = lifecycleRootOf(state);
  const firstAdoption = findConfigFiles(lifecycleRoot).length === 0;
  const applied: AppliedAction[] = [];

  const before = new Map(actions.flatMap((action) =>
    action.kind === 'write' ? [[action.path, readText(root, action.path)] as const] : []));

  return {
    landed: (action) => {
      const entry = appliedAction(action, before);

      if (entry !== null) {
        applied.push(entry);
      }

      if (action.kind === 'write') {
        before.set(action.path, action.content);
      }
    },
    finish: (log) => {
      if (!applied.length) {
        return;
      }

      const outcome = recordAdoption({
        lifecycleRoot,
        applicationRoot: state.applicationRoot,
        applied,
        firstAdoption,
        legacyShape: fs.readdirSync(root).some((name) => LEGACY_BACKUP.test(name)),
      });

      if (outcome.status === 'skipped') {
        log(renderActionLine('instruct', renderLifecycleRecordSkipped(outcome.reason), 'applied'));

        return;
      }

      fs.writeFileSync(outcome.file, outcome.content);

      log(renderActionLine(
        'write',
        renderLifecycleRecordNote(LIFECYCLE_FILE, outcome.established),
        'applied',
      ));
    },
  };
}
