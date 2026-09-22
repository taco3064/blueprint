import fs from 'node:fs';
import path from 'node:path';

import { defaultExec } from '../bootstrap';
import type { Exec } from '../bootstrap';
import { LIFECYCLE_FILE, PACKAGE_NAME } from '../lifecycle';
import { defaultGitReader } from '../project';
import type { GitReader, ResolveOptions } from '../project';
import {
  renderLifecycleStateInvalid,
  renderRemoveComplete,
  renderRemoveConflicts,
  renderRemovePlan,
  renderRemovePhaseFailure,
  renderRemovePostconditionFailure,
  renderRemoveRecovery,
  renderRemoveRecoveryConflict,
  renderRemoveRecoveryFailure,
  renderRemoveRefusal,
  renderRemoveUninstall,
} from '../operational-contract';
import { applicationRemoval } from './application';
import { applyRemoval, removalPostconditionFailures } from './apply';
import type { ApplyContext } from './apply';
import { gatherRemovalFacts, missingStateInstall } from './facts';
import type { RemovalFacts } from './facts';
import { planRemoval } from './plan';
import type { RemovalPlan } from './plan';
import {
  captureRemovalRecoveryAuthority,
  planPostUninstallRecovery,
} from './recovery';
import type { RemovalRecoveryAuthority } from './recovery';
import type { RemovalAction } from './types';
import { declared } from './uninstall';

export interface RemoveOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
  git?: GitReader;
  loadConfig?: ResolveOptions['loadConfig'];
  exec?: Exec;
}

function refuseUnsafeFacts(facts: RemovalFacts, git: GitReader): void {
  if (facts.state.status === 'invalid') {
    throw new Error(renderLifecycleStateInvalid(LIFECYCLE_FILE, facts.state.reason));
  }

  if (!facts.scope.length) {
    throw new Error(renderRemoveRefusal({ kind: 'not-adopted', root: facts.root }));
  }

  const installed = missingStateInstall(facts, git);

  if (installed !== null) {
    throw new Error(renderRemoveRefusal({
      kind: 'missing-state', file: LIFECYCLE_FILE, installed,
    }));
  }

  const pending = facts.state.status === 'present' && facts.state.state.pending !== null;

  if (pending && facts.remaining.length) {
    throw new Error(renderRemoveRefusal({
      kind: 'pending-upgrade', file: LIFECYCLE_FILE, applications: facts.remaining,
    }));
  }
}

function leftovers(facts: RemovalFacts, plan: RemovalPlan): string[] {
  const proven = facts.scope.flatMap((application) =>
    applicationRemoval({ ...application, provenance: [] }, 'legacy').actions)
    .map((action) => action.path);

  const state = !facts.remaining.length && fs.existsSync(path.join(facts.root, LIFECYCLE_FILE))
    ? [LIFECYCLE_FILE]
    : [];

  const packages = plan.uninstall.filter((step) => declared(step.root).includes(PACKAGE_NAME))
    .map((step) => `${step.manifest}/package.json → ${PACKAGE_NAME}`);

  return [...proven, ...state, ...packages];
}

function runUninstall(
  steps: RemovalPlan['uninstall'],
  log: (line: string) => void,
  exec: Exec,
): void {
  for (const step of steps) {
    log(renderRemoveUninstall(step.command, step.manifest));
    exec(step.command, step.root);
  }
}

function assertRemovalPostconditions(
  actions: RemovalPlan['actions'],
  context: Parameters<typeof removalPostconditionFailures>[1],
): void {
  const failures = removalPostconditionFailures(actions, context);

  if (failures.length) {
    throw new Error(renderRemovePostconditionFailure(failures));
  }
}

async function prepareRemoval(
  cwd: string,
  options: RemoveOptions,
  git: GitReader,
): Promise<{ facts: RemovalFacts; plan: RemovalPlan }> {
  const facts = await gatherRemovalFacts(cwd, { git, loadConfig: options.loadConfig });

  refuseUnsafeFacts(facts, git);

  return { facts, plan: planRemoval(facts, git) };
}

function isLifecycleAction(action: RemovalAction): boolean {
  return (action as Partial<Exclude<RemovalAction, { kind: 'ref' }>>).reason === 'lifecycle-state';
}

function removalTarget(action: RemovalAction): string {
  return action.kind === 'ref' ? `Git ref ${action.ref}` : action.path;
}

function recoveryScope(plan: RemovalPlan, root: string): RemovalAction[] {
  const manifests = new Set(plan.uninstall.map((step) => path.join(step.root, 'package.json')));

  return plan.actions.filter((action) => action.kind !== 'write'
    || !manifests.has(path.resolve(root, action.path)));
}

function preparePostUninstallRecovery(
  plan: RemovalPlan,
  root: string,
  context: ApplyContext,
): { actions: RemovalAction[]; authority: RemovalRecoveryAuthority } {
  const actions = recoveryScope(plan, root);

  return { actions, authority: captureRemovalRecoveryAuthority(actions, context) };
}

export function applyVerifiedRemoval(
  actions: RemovalPlan['actions'],
  context: Parameters<typeof applyRemoval>[1],
  classifyLifecycle: (action: RemovalAction) => boolean = isLifecycleAction,
): void {
  const lifecycleActions = actions.filter(classifyLifecycle);
  const deAdoptionActions = actions.filter((action) => !classifyLifecycle(action));

  if (lifecycleActions.some((action) => !isLifecycleAction(action))
    || deAdoptionActions.some(isLifecycleAction)
    || lifecycleActions.length + deAdoptionActions.length !== actions.length) {
    throw new Error(renderRemovePhaseFailure());
  }

  applyRemoval(deAdoptionActions, context);
  assertRemovalPostconditions(deAdoptionActions, context);
  applyRemoval(lifecycleActions, context);
  assertRemovalPostconditions(lifecycleActions, context);
}

function assertPostUninstallState(actions: RemovalAction[], context: ApplyContext): void {
  const failures = removalPostconditionFailures(actions, context);

  if (failures.length) {
    throw new Error(renderRemoveRecoveryFailure(failures));
  }
}

function reapplyRecoveryAction(input: {
  action: RemovalAction;
  actions: RemovalAction[];
  applied: string[];
  authority: RemovalRecoveryAuthority;
  context: ApplyContext;
}): void {
  const { action, actions, applied, authority, context } = input;
  const current = planPostUninstallRecovery(authority, context);

  if (!current.actions.includes(action)) {
    return;
  }

  try {
    applyRemoval([action], context);
  } catch (error) {
    assertPostUninstallState(actions, context);

    throw error;
  }

  applied.push(removalTarget(action));
}

function recoverAfterUninstall(input: {
  actions: RemovalAction[];
  authority: RemovalRecoveryAuthority;
  context: ApplyContext;
  log: (line: string) => void;
}): void {
  const { actions, authority, context, log } = input;
  const recovery = planPostUninstallRecovery(authority, context);

  if (!recovery.actions.length) {
    if (recovery.conflicts.length) {
      throw new Error(renderRemoveRecoveryConflict(recovery.conflicts));
    }

    return;
  }

  log(renderRemoveRecovery(recovery.actions.map(removalTarget)));

  const applied: string[] = [];

  for (const action of recovery.actions) {
    reapplyRecoveryAction({ action, actions, applied, authority, context });
  }

  const final = planPostUninstallRecovery(authority, context);

  if (final.conflicts.length) {
    throw new Error(renderRemoveRecoveryConflict(final.conflicts, applied));
  }

  assertPostUninstallState(actions, context);
}

export async function runRemove(cwd: string, options: RemoveOptions = {}): Promise<number> {
  const { log = (line: string) => console.log(line), git = defaultGitReader } = options;
  const { facts, plan } = await prepareRemoval(cwd, options, git);

  log(renderRemovePlan({
    dryRun: Boolean(options.dryRun),
    mode: facts.mode,
    applications: facts.scope.map((application) => application.key),
    remaining: facts.remaining,
    actions: plan.actions,
    residues: plan.residues,
    uninstall: plan.uninstall,
  }));

  if (plan.conflicts.length) {
    throw new Error(renderRemoveConflicts(plan.conflicts));
  }

  if (options.dryRun) {
    return 0;
  }

  const applyContext = {
    root: facts.root,
    boundaries: [facts.root, ...facts.scope.map((application) => application.root)],
    git,
    log,
  };

  const recovery = preparePostUninstallRecovery(plan, facts.root, applyContext);

  applyVerifiedRemoval(plan.actions, applyContext);

  runUninstall(plan.uninstall, log, options.exec ?? defaultExec);

  recoverAfterUninstall({
    actions: recovery.actions,
    authority: recovery.authority,
    context: applyContext,
    log,
  });

  const remaining = leftovers(facts, plan);

  log(renderRemoveComplete(remaining));

  return remaining.length ? 1 : 0;
}
