import type { Blueprint } from '../config';
import { verifyTransformationObligation } from '../inspect';
import {
  AUTHORING_FILE,
  COMMAND_FILE,
  readTexts,
  readTransformationObligation,
  TRANSFORMATION_OBLIGATION_FILE,
} from '../project';
import type { ProjectState } from '../project';
import {
  renderTransformationObligationError,
  renderTransformationRetireNote,
} from '../operational-contract';
import type { Action } from './types';

export function transformationRetirement(input: {
  root: string;
  state: ProjectState;
  blueprint: Blueprint | null;
  authoring?: boolean;
}): Action[] | null {
  const obligation = readTransformationObligation(input.root);

  if (!obligation) {
    return null;
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
