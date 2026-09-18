import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  LIFECYCLE_DRAFT,
  LIFECYCLE_FILE,
  serializeLifecycleState,
  UPGRADE_PLAYBOOK_FILE,
} from '../lifecycle';
import type { GitReader } from '../project';
import { applicationRemoval } from './application';
import type { RemovalFacts } from './facts';
import { plannedFiles, referenceConflicts } from './references';
import type {
  FileAction,
  RemovalAction,
  RemovalConflict,
  RemovalResidue,
  UninstallStep,
} from './types';
import { uninstallPlan } from './uninstall';

export interface RemovalPlan {
  actions: RemovalAction[];
  conflicts: RemovalConflict[];
  residues: RemovalResidue[];
  uninstall: UninstallStep[];
}

function transformationRefs(facts: RemovalFacts, git: GitReader): RemovalAction[] {
  return facts.scope.flatMap((application) => {
    const key = application.key === '.' ? '' : application.key;
    const ref = `refs/blueprint/transformations/${createHash('sha256').update(key).digest('hex')}`;
    const listed = git(['for-each-ref', '--format=%(refname)', ref], facts.root);

    return listed.stdout.split(/\r?\n/).includes(ref)
      ? [{ kind: 'ref' as const, ref, application: application.key }]
      : [];
  });
}

function leftover(
  facts: RemovalFacts,
  file: string,
  reason: 'workflow' | 'lifecycle-state',
): FileAction[] {
  return !facts.remaining.length && fs.existsSync(path.join(facts.root, file))
    ? [{ kind: 'delete', path: file, reason }]
    : [];
}

function lifecycleActions(facts: RemovalFacts): FileAction[] {
  const leftovers = [
    ...leftover(facts, UPGRADE_PLAYBOOK_FILE, 'workflow'),
    ...leftover(facts, LIFECYCLE_DRAFT, 'lifecycle-state'),
  ];

  if (facts.state.status !== 'present') {
    return leftovers;
  }

  if (!facts.remaining.length) {
    return [...leftovers, { kind: 'delete', path: LIFECYCLE_FILE, reason: 'lifecycle-state' }];
  }

  const removed = new Set(facts.scope.map((application) => application.key));

  const applications = Object.fromEntries(Object.entries(facts.state.state.applications)
    .filter(([key]) => !removed.has(key)));

  return [{
    kind: 'write',
    path: LIFECYCLE_FILE,
    content: serializeLifecycleState({ ...facts.state.state, applications }),
    reason: 'lifecycle-state',
  }];
}

export function planRemoval(facts: RemovalFacts, git: GitReader): RemovalPlan {
  const parts = facts.scope.map((application) => applicationRemoval(application, facts.mode));
  const actions = [...parts.flatMap((part) => part.actions), ...lifecycleActions(facts)];
  const planned = plannedFiles(actions);
  const uninstall = uninstallPlan(facts, planned);

  return {
    actions: [...actions, ...transformationRefs(facts, git)],
    conflicts: [...parts.flatMap((part) => part.conflicts), ...referenceConflicts(facts, planned)],
    residues: [...parts.flatMap((part) => part.residues), ...uninstall.residues],
    uninstall: uninstall.steps,
  };
}
