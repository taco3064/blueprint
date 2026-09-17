import fs from 'node:fs';
import path from 'node:path';

import { ancestors } from '../lifecycle';
import type { GitReader } from '../project';
import { renderRemoveAction, renderRemoveEmptyDirectory } from '../operational-contract';
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

function removeEmptyParents(file: string, context: ApplyContext): void {
  const chain = ancestors(path.dirname(path.join(context.root, file)));
  const boundary = chain.findIndex((directory) => context.boundaries.includes(directory));

  for (const directory of chain.slice(0, boundary)) {
    if (!fs.existsSync(directory) || fs.readdirSync(directory).length) {
      return;
    }

    fs.rmdirSync(directory);

    context.log(renderRemoveEmptyDirectory(
      path.relative(context.root, directory).split(path.sep).join('/'),
    ));
  }
}

function applyOne(action: RemovalAction, context: ApplyContext): void {
  if (action.kind === 'ref') {
    context.git(['update-ref', '-d', action.ref], context.root);
  } else if (action.kind === 'write') {
    fs.writeFileSync(path.join(context.root, action.path), action.content);
  } else if (action.kind === 'rmdir') {
    fs.rmSync(path.join(context.root, action.path), { recursive: true, force: true });
  } else {
    fs.rmSync(path.join(context.root, action.path), { force: true });
  }

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
