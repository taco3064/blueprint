import fs from 'node:fs';
import path from 'node:path';

import type { Blueprint } from '../config';
import { verifyTransformationObligation } from '../inspect';
import {
  AUTHORING_FILE,
  assertTransformationAuthority,
  writeTransformationAuthority,
  COMMAND_FILE,
  readTexts,
  readTransformationObligation,
  TRANSFORMATION_OBLIGATION_FILE,
} from '../project';
import type { ProjectState } from '../project';
import {
  renderDestructiveActionFailure,
  renderTransformationObligationError,
  renderTransformationRetireNote, renderActionLine,
} from '../operational-contract';
import type { Action } from './types';
import { apply, defaultExec, pathExists } from './apply';

export function transformationRetirement(input: {
  root: string;
  state: ProjectState;
  blueprint: Blueprint | null;
  authoring?: boolean;
  requestedTopology?: 'layer-first' | 'module-first';
}): Extract<Action, { kind: 'rm' }>[] | null {
  const obligation = readTransformationObligation(input.root);

  assertTransformationAuthority(input.root, obligation);

  if (!obligation) {
    return null;
  }

  if (input.requestedTopology && input.requestedTopology !== obligation.target.topology) {
    throw new Error(renderTransformationObligationError({
      kind: 'incomplete', failures: [{
        code: 'topology-request-conflict', expected: obligation.target.topology,
        actual: input.requestedTopology,
      }],
    }));
  }

  if (input.authoring) {
    throw new Error(renderTransformationObligationError({
      kind: 'reauthoring', file: TRANSFORMATION_OBLIGATION_FILE,
    }));
  }

  if (!input.blueprint) {
    throw new Error(renderTransformationObligationError({
      kind: 'missing-config', file: TRANSFORMATION_OBLIGATION_FILE,
    }));
  }

  const verification = verifyTransformationObligation({
    root: input.root,
    obligation,
    blueprint: input.blueprint,
    state: input.state,
  });

  if (!verification.ok) {
    throw new Error(renderTransformationObligationError({
      kind: 'incomplete', failures: verification.failures,
    }));
  }

  return [TRANSFORMATION_OBLIGATION_FILE, AUTHORING_FILE, COMMAND_FILE]
    .filter((file) => readTexts(input.root, [file])[file] !== null)
    .map((file) => ({
      kind: 'rm',
      path: file,
      note: renderTransformationRetireNote(file),
    }));
}

export async function completeTransformationRetirement(
  root: string,
  context: {
    retirement: Extract<Action, { kind: 'rm' }>[];
    dryRun?: boolean;
    log: (line: string) => void;
  },
  scaffold: (trailing: Action[]) => Promise<Action[]>,
): Promise<Action[]> {
  if (context.dryRun) {
    return scaffold(context.retirement);
  }

  const obligation = readTransformationObligation(root)!;

  const obligationSource = readTexts(root, [TRANSFORMATION_OBLIGATION_FILE])[
    TRANSFORMATION_OBLIGATION_FILE
  ]!;

  const cleanup = context.retirement.find((action) =>
    action.path === TRANSFORMATION_OBLIGATION_FILE) ?? {
    kind: 'rm' as const,
    path: TRANSFORMATION_OBLIGATION_FILE,
    note: renderTransformationRetireNote(TRANSFORMATION_OBLIGATION_FILE),
  };

  const trailing = context.retirement.filter((action) => action !== cleanup);
  const actions = await scaffold(trailing);

  for (const file of [AUTHORING_FILE, COMMAND_FILE]) {
    if (pathExists(path.join(root, file))) {
      throw new Error(renderDestructiveActionFailure(file));
    }
  }

  apply(root, [cleanup], {
    exec: defaultExec,
    onApplied: (action) => context.log(renderActionLine(action.kind, action.note, 'applied')),
  });

  completeAuthority(root, obligation, obligationSource);

  return [...actions, cleanup];
}

function completeAuthority(
  root: string,
  obligation: NonNullable<ReturnType<typeof readTransformationObligation>>,
  obligationSource: string,
): void {
  try {
    writeTransformationAuthority(root, obligation, { status: 'completed' });
  } catch (error) {
    fs.writeFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), obligationSource);

    throw error;
  }
}
