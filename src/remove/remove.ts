import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { LIFECYCLE_FILE, PACKAGE_NAME } from '../lifecycle';
import { defaultGitReader } from '../project';
import type { GitReader, ResolveOptions } from '../project';
import {
  renderLifecycleStateInvalid,
  renderRemoveComplete,
  renderRemoveConflicts,
  renderRemovePlan,
  renderRemoveRefusal,
  renderRemoveUninstall,
} from '../operational-contract';
import { applicationRemoval } from './application';
import { applyRemoval } from './apply';
import { gatherRemovalFacts, missingStateInstall } from './facts';
import type { RemovalFacts } from './facts';
import { planRemoval } from './plan';
import type { RemovalPlan } from './plan';

export type RemoveCommandRunner = (command: string, cwd: string) => void;

export interface RemoveOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
  git?: GitReader;
  loadConfig?: ResolveOptions['loadConfig'];
  exec?: RemoveCommandRunner;
}

/* v8 ignore start -- real package manager; tests inject exec */
const defaultRunner: RemoveCommandRunner = (command, cwd) => {
  execSync(command, { cwd, stdio: 'inherit' });
};
/* v8 ignore stop */

function refuseUnsafeFacts(facts: RemovalFacts): void {
  if (facts.state.status === 'invalid') {
    throw new Error(renderLifecycleStateInvalid(LIFECYCLE_FILE, facts.state.reason));
  }

  if (!facts.scope.length) {
    throw new Error(renderRemoveRefusal({ kind: 'not-adopted', root: facts.root }));
  }

  const installed = missingStateInstall(facts);

  if (installed !== null) {
    throw new Error(renderRemoveRefusal({
      kind: 'missing-state', file: LIFECYCLE_FILE, installed,
    }));
  }
}

function declares(root: string): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

    return Object.hasOwn({ ...manifest.dependencies, ...manifest.devDependencies }, PACKAGE_NAME);
  } catch {
    return false;
  }
}

function leftovers(facts: RemovalFacts, plan: RemovalPlan): string[] {
  const proven = facts.scope.flatMap((application) =>
    applicationRemoval({ ...application, provenance: [] }, 'legacy').actions)
    .map((action) => action.path);

  const state = !facts.remaining.length && fs.existsSync(path.join(facts.root, LIFECYCLE_FILE))
    ? [LIFECYCLE_FILE]
    : [];

  const packages = plan.uninstall.filter((step) => declares(step.root))
    .map((step) => `${step.manifest}/package.json → ${PACKAGE_NAME}`);

  return [...proven, ...state, ...packages];
}

function runUninstall(
  steps: RemovalPlan['uninstall'],
  log: (line: string) => void,
  exec: RemoveCommandRunner,
): void {
  for (const step of steps) {
    log(renderRemoveUninstall(step.command, step.manifest));
    exec(step.command, step.root);
  }
}

export async function runRemove(cwd: string, options: RemoveOptions = {}): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  const git = options.git ?? defaultGitReader;
  const facts = await gatherRemovalFacts(cwd, { git, loadConfig: options.loadConfig });

  refuseUnsafeFacts(facts);

  const plan = planRemoval(facts, git);

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

  applyRemoval(plan.actions, {
    root: facts.root,
    boundaries: [facts.root, ...facts.scope.map((application) => application.root)],
    git,
    log,
  });

  runUninstall(plan.uninstall, log, options.exec ?? defaultRunner);

  const remaining = leftovers(facts, plan);

  log(renderRemoveComplete(remaining));

  return remaining.length ? 1 : 0;
}
