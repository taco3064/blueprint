import {
  assertTransformationAuthority,
  AUTHORING_FILE,
  readTexts,
  readTransformationObligation,
  recoverTransformationObligation,
  TRANSFORMATION_OBLIGATION_FILE,
  transformationObligationSource,
} from '../project';
import {
  renderActionLine,
  renderTransformationObligationError,
  renderTransformationRecoveryGuide,
  renderTransformationRecoveryNote,
} from '../operational-contract';
import { apply, defaultExec } from './apply';
import type { InitOptions } from './bootstrap';
import type { Action } from './types';

export function runTransformationRecovery(root: string, options: InitOptions): Action[] {
  if (options.topology || options.authoring || options.preset || options.agent
    || options.framework || options.install !== undefined) {
    throw new Error(renderTransformationObligationError({
      kind: 'incomplete', failures: [{ code: 'authority-recovery-options' }],
    }));
  }

  const retained = recoverTransformationObligation(root);
  const current = readTransformationObligation(root);

  if (current) {
    assertTransformationAuthority(root, current);
  }

  const actions = recoveryActions(root, current, retained);
  const log = options.log ?? ((line: string) => console.log(line));

  if (options.dryRun) {
    for (const action of actions) {
      log(renderActionLine(action.kind, action.note, 'dry-run'));
    }
  } else {
    apply(root, actions, {
      exec: defaultExec,
      onApplied: (action) => log(renderActionLine(action.kind, action.note, 'applied')),
    });
  }

  return actions;
}

function recoveryActions(
  root: string,
  current: ReturnType<typeof readTransformationObligation>,
  retained: ReturnType<typeof recoverTransformationObligation>,
): Action[] {
  const actions: Action[] = [];

  if (!current) {
    actions.push({
      kind: 'write', path: TRANSFORMATION_OBLIGATION_FILE,
      content: transformationObligationSource(retained),
      note: renderTransformationRecoveryNote('obligation'),
    });
  }

  if (readTexts(root, [AUTHORING_FILE])[AUTHORING_FILE] === null) {
    actions.push({
      kind: 'write', path: AUTHORING_FILE,
      content: renderTransformationRecoveryGuide(retained.origin),
      note: renderTransformationRecoveryNote('guide'),
    });
  }

  actions.push({ kind: 'instruct', note: renderTransformationRecoveryNote('pending') });

  return actions;
}
