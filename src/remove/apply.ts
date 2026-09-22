import fs from 'node:fs';
import path from 'node:path';

import { ancestors, writeLifecycleText } from '../lifecycle';
import type { GitReader } from '../project';
import {
  renderRemoveAction,
  renderRemoveEmptyDirectory,
  renderRemovePostconditionFailure,
} from '../operational-contract';
import type { RemovalAction, RemovalReason } from './types';

const PHASES: Record<RemovalAction['kind'], number> = { write: 0, delete: 1, rmdir: 2, ref: 3 };

const LAST: readonly (RemovalReason | undefined)[] = ['config', 'lifecycle-state'];

function phase(action: RemovalAction): number {
  const last = LAST.indexOf((action as { reason?: RemovalReason }).reason);

  return last === -1 ? PHASES[action.kind] : PHASES.ref + 1 + last;
}

export interface ApplyContext {
  root: string;
  boundaries: string[];
  git: GitReader;
  log: (line: string) => void;
}

export function removalPathExists(target: string): boolean {
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

function removeEmptyParents(file: string, context: ApplyContext): void {
  const chain = ancestors(path.dirname(path.join(context.root, file)));
  const boundary = chain.findIndex((directory) => context.boundaries.includes(directory));

  for (const directory of chain.slice(0, boundary)) {
    if (!removalPathExists(directory) || fs.readdirSync(directory).length) {
      return;
    }

    fs.rmdirSync(directory);

    if (removalPathExists(directory)) {
      throw new Error(renderRemovePostconditionFailure([
        `folder ${path.relative(context.root, directory).split(path.sep).join('/')} still exists`,
      ]));
    }

    context.log(renderRemoveEmptyDirectory(
      path.relative(context.root, directory).split(path.sep).join('/'),
    ));
  }
}

function postconditionFailure(action: RemovalAction, context: ApplyContext): string | null {
  if (action.kind === 'ref') {
    const listed = context.git(
      ['for-each-ref', '--format=%(refname)', action.ref],
      context.root,
    );

    return listed.status !== 0 || listed.stdout.split(/\r?\n/).includes(action.ref)
      ? `Git ref ${action.ref} still exists or could not be verified absent`
      : null;
  }

  const file = path.join(context.root, action.path);

  if (action.kind === 'write') {
    return !removalPathExists(file) || fs.readFileSync(file, 'utf8') !== action.content
      ? `${action.path} does not contain the planned rewrite`
      : null;
  }

  return removalPathExists(file) ? `${action.path} still exists` : null;
}

export function removalPostconditionFailures(
  actions: readonly RemovalAction[],
  context: ApplyContext,
): string[] {
  return actions.flatMap((action) => {
    const failure = postconditionFailure(action, context);

    return failure === null ? [] : [failure];
  });
}

function assertPostconditions(actions: readonly RemovalAction[], context: ApplyContext): void {
  const failures = removalPostconditionFailures(actions, context);

  if (failures.length) {
    throw new Error(renderRemovePostconditionFailure(failures));
  }
}

function writeFile(action: Extract<RemovalAction, { kind: 'write' }>, root: string): void {
  if (action.reason === 'lifecycle-state') {
    writeLifecycleText(root, action.content);
  } else {
    fs.writeFileSync(path.join(root, action.path), action.content);
  }
}

function applyOne(action: RemovalAction, context: ApplyContext): void {
  if (action.kind === 'ref') {
    context.git(['update-ref', '-d', action.ref], context.root);
  } else if (action.kind === 'write') {
    writeFile(action, context.root);
  } else {
    fs.rmSync(path.join(context.root, action.path), {
      // Stryker disable next-line ConditionalExpression: a recursive file delete is one delete.
      recursive: action.kind === 'rmdir',
      force: true,
    });
  }

  assertPostconditions([action], context);

  context.log(renderRemoveAction(action, 'applied'));

  if (action.kind === 'delete' || action.kind === 'rmdir') {
    removeEmptyParents(action.path, context);
  }
}

export function applyRemoval(actions: readonly RemovalAction[], context: ApplyContext): void {
  const ordered = [...actions].sort((left, right) => phase(left) - phase(right));

  for (const action of ordered) {
    applyOne(action, context);
  }
}
