import { defaultExec } from '../bootstrap';
import type { Exec } from '../bootstrap';
import {
  installedPackage,
  LIFECYCLE_FILE,
  readLifecycleState,
  runningInstallSpec,
  runningPackage,
  UPGRADE_CATALOG,
  UPGRADE_PLAYBOOK_FILE,
  writeLifecycleState,
} from '../lifecycle';
import type { LifecycleState, PackageLocation, UpgradeCatalog } from '../lifecycle';
import type { GitReader } from '../project';
import {
  renderUpgradeComplete,
  renderUpgradeCurrent,
  renderUpgradeHandoff,
  renderUpgradeInstallStarting,
  renderUpgradeInstruction,
  renderUpgradeOperationCompleted,
  renderUpgradePlan,
  renderUpgradePlaybookWritten,
  renderUpgradeReconcile,
  renderUpgradeRefusal,
  renderUpgradeStateRecorded,
  renderUpgradeVerificationPending,
  renderUpgradeVerificationResult,
} from '../operational-contract';
import type { UpgradePlanFact, UpgradeRefusalFact } from '../operational-contract';
import { decideUpgrade } from './decide';
import type { UpgradeProceed } from './decide';
import {
  defaultHandoff,
  defaultReconciler,
  verificationPassed,
  verifyApplication,
} from './effects';
import type { ApplicationVerifier, Handoff, Reconciler } from './effects';
import { gatherUpgradeFacts } from './facts';
import type { ConfigLoader, UpgradeFacts } from './facts';
import {
  completionRefusal,
  remainingOperations,
  removePlaybook,
  writePlaybook,
} from './semantic';
import type { InstructionLookup } from './semantic';

export interface UpgradeOptions {
  dryRun?: boolean;
  complete?: string;
  log?: (line: string) => void;
  git?: GitReader;
  loadConfig?: ConfigLoader;
  running?: PackageLocation | null;
  catalog?: UpgradeCatalog;
  instruction?: InstructionLookup;
  exec?: Exec;
  handoff?: Handoff;
  reconcile?: Reconciler;
  verify?: ApplicationVerifier;
}

interface Context {
  cwd: string;
  log: (line: string) => void;
  catalog: UpgradeCatalog;
  instruction: InstructionLookup;
  exec: Exec;
  handoff: Handoff;
  reconcile: Reconciler;
  verify: ApplicationVerifier;
}

function refusal(fact: UpgradeRefusalFact): Error {
  return new Error(renderUpgradeRefusal(fact));
}

export async function runUpgrade(cwd: string, options: UpgradeOptions = {}): Promise<number> {
  if (options.complete !== undefined && options.dryRun) {
    throw refusal({ kind: 'complete-dry-run' });
  }

  const context: Context = {
    cwd,
    log: options.log ?? ((line) => console.log(line)),
    catalog: options.catalog ?? UPGRADE_CATALOG,
    instruction: options.instruction ?? renderUpgradeInstruction,
    exec: options.exec ?? defaultExec,
    handoff: options.handoff ?? defaultHandoff,
    reconcile: options.reconcile ?? defaultReconciler,
    verify: options.verify ?? verifyApplication,
  };

  const facts = await gatherUpgradeFacts(cwd, {
    git: options.git, loadConfig: options.loadConfig, catalog: context.catalog,
  });

  return options.complete === undefined
    ? upgrade(facts, context, options)
    : completeOperation(facts, context, options.complete);
}

async function upgrade(facts: UpgradeFacts, context: Context, options: UpgradeOptions) {
  const running = options.running === undefined ? runningPackage() : options.running;

  const decision = decideUpgrade({
    facts,
    running,
    catalog: context.catalog,
    installSpec: running === null ? '' : runningInstallSpec(running),
    hasInstruction: (id) => context.instruction(id) !== null,
  });

  if (decision.kind === 'refuse') {
    throw refusal(decision.refusal);
  }

  if (decision.kind === 'current') {
    context.log(renderUpgradeCurrent(decision.version));

    return 0;
  }

  const plan = planFact(decision, facts, {
    catalog: context.catalog, dryRun: Boolean(options.dryRun),
  });

  context.log(renderUpgradePlan(plan));

  return options.dryRun ? 0 : applyUpgrade(decision, facts, context);
}

function planFact(
  decision: UpgradeProceed,
  facts: UpgradeFacts,
  settings: { catalog: UpgradeCatalog; dryRun: boolean },
): UpgradePlanFact {
  const { pending } = decision;

  return {
    dryRun: settings.dryRun,
    mode: decision.mode,
    source: decision.source,
    evidence: decision.evidence,
    target: decision.target,
    applications: facts.applications.map((entry) => ({
      key: entry.key, installed: entry.installed?.version ?? 'not installed',
    })),
    installs: decision.installs.map(({ manifest, command }) => ({ manifest, command })),
    migrations: decision.migrations,
    operations: pending.operations.map((operation) => ({
      id: operation.id,
      introducedIn: settings.catalog.operations.find((entry) => entry.id === operation.id)!
        .introducedIn,
      applications: operation.applications,
      completed: pending.completed.includes(operation.id),
    })),
    suppressed: decision.suppressed,
    inapplicable: decision.inapplicable,
    safety: {
      repository: facts.git.repository,
      changes: facts.git.changes,
      required: decision.mode === 'start',
    },
  };
}

async function applyUpgrade(decision: UpgradeProceed, facts: UpgradeFacts, context: Context) {
  if (decision.mode === 'start' && !facts.git.repository) {
    throw refusal({ kind: 'git-required' });
  }

  if (decision.mode === 'start' && facts.git.changes.length) {
    throw refusal({ kind: 'dirty-worktree', changes: facts.git.changes });
  }

  if (decision.mode !== 'resume') {
    writeLifecycleState(facts.root, { ...decision.state, pending: decision.pending });
    context.log(renderUpgradeStateRecorded(LIFECYCLE_FILE, decision.source, decision.target));
  }

  return decision.installs.length
    ? installAndHandoff(decision, facts, context)
    : continueUpgrade(decision, facts, context);
}

function installAndHandoff(
  decision: UpgradeProceed,
  facts: UpgradeFacts,
  context: Context,
): number {
  for (const step of decision.installs) {
    context.log(renderUpgradeInstallStarting(step.command, step.manifest));
    context.exec(step.command, step.root);
  }

  for (const entry of facts.applications) {
    const installed = installedPackage(entry.root);

    if (installed?.version !== decision.target) {
      throw refusal({
        kind: 'install-mismatch',
        manifest: entry.key,
        installed: installed?.version ?? null,
        target: decision.target,
      });
    }
  }

  context.log(renderUpgradeHandoff(decision.target));

  return context.handoff(installedPackage(facts.applications[0].root)!, context.cwd);
}

async function continueUpgrade(decision: UpgradeProceed, facts: UpgradeFacts, context: Context) {
  for (const entry of facts.applications) {
    context.log(renderUpgradeReconcile(entry.key));
    await context.reconcile(entry.root, context.log);
  }

  const remaining = remainingOperations(decision.pending);

  if (remaining.length) {
    writePlaybook(facts.root, { ...context, pending: decision.pending });
    context.log(renderUpgradePlaybookWritten(UPGRADE_PLAYBOOK_FILE, remaining.length));

    return 1;
  }

  if (!(await verifyAdoptedApplications(facts, context))) {
    context.log(renderUpgradeVerificationPending());

    return 1;
  }

  recordCompletion(facts.root, decision);
  context.log(renderUpgradeComplete(decision.source, decision.target));

  return 0;
}

async function verifyAdoptedApplications(facts: UpgradeFacts, context: Context): Promise<boolean> {
  let passed = true;

  for (const entry of facts.applications) {
    const result = await context.verify(entry.root, entry.key);

    context.log(renderUpgradeVerificationResult(result));
    passed &&= verificationPassed(result);
  }

  return passed;
}

function recordCompletion(root: string, decision: UpgradeProceed): void {
  const current = readLifecycleState(root);
  const state = current.status === 'present' ? current.state : decision.state;

  const completed: LifecycleState = {
    ...state,
    blueprint: decision.target,
    operations: [...new Set([...state.operations, ...decision.pending.completed])],
    pending: null,
  };

  writeLifecycleState(root, completed);
  removePlaybook(root);
}

function completeOperation(facts: UpgradeFacts, context: Context, id: string): number {
  if (facts.state.status !== 'present') {
    throw refusal(facts.state.status === 'invalid'
      ? { kind: 'invalid-state', file: LIFECYCLE_FILE, reason: facts.state.reason }
      : { kind: 'no-pending', id });
  }

  const { state } = facts.state;
  const { pending } = state;
  const problem = completionRefusal({ root: facts.root, catalog: context.catalog, pending }, id);

  if (problem !== null) {
    throw refusal(problem);
  }

  const next = { ...pending!, completed: [...pending!.completed, id] };

  writeLifecycleState(facts.root, { ...state, pending: next });
  writePlaybook(facts.root, { ...context, pending: next });
  context.log(renderUpgradeOperationCompleted(id, remainingOperations(next).length));

  return 0;
}
