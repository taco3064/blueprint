import fs from 'node:fs';
import path from 'node:path';

import type { ApplyContext } from './apply';
import { removalPostconditionFailures } from './apply';
import type { RemovalAction } from './types';

type FileSnapshot
  = | { kind: 'absent' }
    | { kind: 'file'; mode: number; content: string }
    | { kind: 'directory'; mode: number; entries: { name: string; state: FileSnapshot }[] }
    | { kind: 'symlink'; mode: number; target: string }
    | { kind: 'other'; mode: number };

type RefSnapshot
  = | { kind: 'absent' }
    | { kind: 'present'; oid: string }
    | { kind: 'unverified' };

type TargetSnapshot = FileSnapshot | RefSnapshot;

interface AuthorizedAction {
  action: RemovalAction;
  before: TargetSnapshot;
}

export interface RemovalRecoveryAuthority {
  entries: AuthorizedAction[];
}

export interface RemovalRecoveryPlan {
  actions: RemovalAction[];
  conflicts: string[];
}

function fileSnapshot(target: string): FileSnapshot {
  let stat: fs.Stats;

  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'absent' };
    }

    throw error;
  }

  const mode = stat.mode & 0o7777;

  if (stat.isFile()) {
    return { kind: 'file', mode, content: fs.readFileSync(target).toString('base64') };
  }

  if (stat.isSymbolicLink()) {
    return { kind: 'symlink', mode, target: fs.readlinkSync(target) };
  }

  if (stat.isDirectory()) {
    return {
      kind: 'directory',
      mode,
      entries: fs.readdirSync(target).sort().map((name) => ({
        name,
        state: fileSnapshot(path.join(target, name)),
      })),
    };
  }

  return { kind: 'other', mode };
}

function refSnapshot(
  action: Extract<RemovalAction, { kind: 'ref' }>,
  context: ApplyContext,
): RefSnapshot {
  const listed = context.git(
    ['for-each-ref', '--format=%(objectname)', action.ref],
    context.root,
  );

  if (listed.status !== 0) {
    return { kind: 'unverified' };
  }

  const oid = listed.stdout.trim();

  return oid ? { kind: 'present', oid } : { kind: 'absent' };
}

function snapshot(action: RemovalAction, context: ApplyContext): TargetSnapshot {
  return action.kind === 'ref'
    ? refSnapshot(action, context)
    : fileSnapshot(path.join(context.root, action.path));
}

function same(left: TargetSnapshot, right: TargetSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function target(action: RemovalAction): string {
  return action.kind === 'ref' ? `Git ref ${action.ref}` : action.path;
}

function safeToReplay(entry: AuthorizedAction, current: TargetSnapshot): boolean {
  // Only a planned rewrite can still be pending while its current target is absent.
  if (current.kind === 'absent') {
    return true;
  }

  return entry.before.kind !== 'unverified'
    && entry.before.kind !== 'other'
    && same(entry.before, current);
}

export function captureRemovalRecoveryAuthority(
  actions: readonly RemovalAction[],
  context: ApplyContext,
): RemovalRecoveryAuthority {
  return { entries: actions.map((action) => ({ action, before: snapshot(action, context) })) };
}

export function planPostUninstallRecovery(
  authority: RemovalRecoveryAuthority,
  context: ApplyContext,
): RemovalRecoveryPlan {
  const pending = authority.entries.filter(({ action }) =>
    removalPostconditionFailures([action], context).length > 0);

  const evaluated = pending.map((entry) => ({
    entry,
    safe: safeToReplay(entry, snapshot(entry.action, context)),
  }));

  const conflicts = evaluated.flatMap(({ entry, safe }) => safe
    ? []
    : [`${target(entry.action)} changed after dependency uninstall`]);

  return {
    actions: evaluated.flatMap(({ entry, safe }) => safe ? [entry.action] : []),
    conflicts,
  };
}
