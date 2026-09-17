import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
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

function lifecycleActions(facts: RemovalFacts): FileAction[] {
  const playbook = fs.existsSync(path.join(facts.root, UPGRADE_PLAYBOOK_FILE))
    && !facts.remaining.length
    ? [{ kind: 'delete' as const, path: UPGRADE_PLAYBOOK_FILE, reason: 'workflow' as const }]
    : [];

  if (facts.state.status !== 'present') {
    return playbook;
  }

  if (!facts.remaining.length) {
    return [...playbook, { kind: 'delete', path: LIFECYCLE_FILE, reason: 'lifecycle-state' }];
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
