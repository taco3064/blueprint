import fs from 'node:fs';
import path from 'node:path';

import type { GitReader } from '../project';
import { renderRemoveAction, renderRemoveEmptyDirectory } from '../operational-contract';
import type { RemovalAction } from './types';

const PHASES: Record<RemovalAction['kind'], number> = { write: 0, delete: 1, rmdir: 2, ref: 3 };

function phase(action: RemovalAction): number {
  if (action.kind !== 'ref' && action.reason === 'lifecycle-state') {
    return 5;
  }

  return action.kind === 'delete' && action.reason === 'config' ? 4 : PHASES[action.kind];
}

export interface ApplyContext {
  root: string;
  boundaries: string[];
  git: GitReader;
  log: (line: string) => void;
}

function removeEmptyParents(file: string, context: ApplyContext): void {
  let directory = path.dirname(path.join(context.root, file));

  while (!context.boundaries.includes(directory)
    && fs.existsSync(directory)
    && !fs.readdirSync(directory).length) {
    fs.rmdirSync(directory);

    context.log(renderRemoveEmptyDirectory(
      path.relative(context.root, directory).split(path.sep).join('/'),
    ));

    directory = path.dirname(directory);
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
  const ordered = actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => phase(left.action) - phase(right.action) || left.index - right.index);

  for (const { action } of ordered) {
    applyOne(action, context);
  }
}
