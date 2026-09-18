import path from 'node:path';

import {
  catalogProblems,
  compareVersions,
  LIFECYCLE_FILE,
  lifecycleHistoryProblem,
  resolveUpgrade,
  withPlanIdentity,
} from '../lifecycle';
import type {
  LifecycleState,
  PackageLocation,
  PendingUpgrade,
  SuppressedOperation,
  UpgradeCatalog,
  UpgradePlan,
} from '../lifecycle';
import type { UpgradeRefusalFact, UpgradeSourceEvidence } from '../operational-contract';
import type { UpgradeApplication, UpgradeFacts } from './facts';

export interface InstallStep {
  manifest: string;
  root: string;
  command: string;
}

export interface UpgradeProceed {
  kind: 'proceed';
  mode: 'start' | 'resume' | 'replan';
  source: string;
  evidence: UpgradeSourceEvidence;
  target: string;
  state: LifecycleState;
  pending: PendingUpgrade;
  migrations: { id: string; applications: string[] }[];
  suppressed: SuppressedOperation[];
  inapplicable: string[];
  installs: InstallStep[];
}

export type UpgradeDecision
  = | { kind: 'refuse'; refusal: UpgradeRefusalFact }
    | { kind: 'current'; version: string }
    | UpgradeProceed;

export interface DecisionInput {
  facts: UpgradeFacts;
  running: PackageLocation | null;
  catalog: UpgradeCatalog;
  installSpec: string;
  hasInstruction: (id: string) => boolean;
}

const refuse = (refusal: UpgradeRefusalFact): UpgradeDecision => ({ kind: 'refuse', refusal });

function catalogRefusal(input: DecisionInput, version: string): UpgradeDecision | null {
  const problems = catalogProblems(input.catalog, version)
    .map((problem) => `${problem.kind}${'id' in problem ? `:${String(problem.id)}` : ''}`);

  const missing = input.catalog.operations
    .filter((operation) => !input.hasInstruction(operation.id))
    .map((operation) => `missing-instruction:${operation.id}`);

  return problems.length || missing.length
    ? refuse({ kind: 'invalid-catalog', problems: [...problems, ...missing] })
    : null;
}

function readinessRefusal(input: DecisionInput): UpgradeDecision | null {
  const { facts } = input;

  if (facts.unreadable !== null) {
    return refuse({ kind: 'config-unreadable', ...facts.unreadable });
  }

  if (!facts.applications.length) {
    return refuse({ kind: 'not-adopted', root: facts.root });
  }

  return facts.workflows.length
    ? refuse({ kind: 'pending-workflow', files: facts.workflows })
    : null;
}

function installedRefusal(facts: UpgradeFacts, target: string): UpgradeDecision | null {
  const installed = facts.applications
    .flatMap((entry) => entry.installed === null ? [] : [entry]);

  const versions = [...new Set(installed.map((entry) => entry.installed!.version))]
    .sort(compareVersions);

  if (versions.length > 1) {
    return refuse({ kind: 'mixed-installed', versions });
  }

  const newer = installed.find((entry) => compareVersions(entry.installed!.version, target) > 0);

  return newer === undefined
    ? null
    : refuse({
        kind: 'installed-newer',
        application: newer.key,
        installed: newer.installed!.version,
        target,
      });
}

function historyRefusal(facts: UpgradeFacts, catalog: UpgradeCatalog): UpgradeDecision | null {
  const { checkpoint } = facts;

  const reason = checkpoint.kind === 'state'
    ? lifecycleHistoryProblem(checkpoint.state, catalog)
    : null;

  return reason === null ? null : refuse({ kind: 'invalid-state', file: LIFECYCLE_FILE, reason });
}

function checkpointRefusal(facts: UpgradeFacts): UpgradeDecision | null {
  const { checkpoint } = facts;

  if (checkpoint.kind === 'invalid-state') {
    return refuse({ kind: 'invalid-state', file: LIFECYCLE_FILE, reason: checkpoint.reason });
  }

  if (checkpoint.kind === 'adoption-incomplete') {
    return refuse({ kind: 'adoption-incomplete', file: LIFECYCLE_FILE });
  }

  if (checkpoint.kind === 'missing-state') {
    return refuse({ kind: 'missing-state', file: LIFECYCLE_FILE, installed: checkpoint.installed });
  }

  if (checkpoint.kind === 'not-installed') {
    return refuse({
      kind: 'not-installed',
      applications: facts.applications.filter((entry) => entry.installed === null)
        .map((entry) => entry.key),
    });
  }

  return checkpoint.kind === 'mixed-installed'
    ? refuse({ kind: 'mixed-installed', versions: checkpoint.versions })
    : null;
}

export function decideUpgrade(input: DecisionInput): UpgradeDecision {
  const { facts, running } = input;

  if (running === null) {
    return refuse({ kind: 'no-running-version' });
  }

  const refusal = catalogRefusal(input, running.version)
    ?? readinessRefusal(input)
    ?? checkpointRefusal(facts)
    ?? historyRefusal(facts, input.catalog);

  const decision = refusal ?? plannedUpgrade(input, running.version);

  return decision.kind === 'refuse'
    ? decision
    : installedRefusal(facts, running.version) ?? decision;
}

function baseState(facts: UpgradeFacts, version: string): LifecycleState {
  return facts.checkpoint.kind === 'state'
    ? facts.checkpoint.state
    : {
        schema: 1,
        blueprint: version,
        provenance: 'partial',
        operations: [],
        pending: null,
        applications: {},
      };
}

function plannedUpgrade(input: DecisionInput, target: string): UpgradeDecision {
  const { facts } = input;
  const checkpoint = facts.checkpoint as Extract<typeof facts.checkpoint, { version: string }>;
  const state = baseState(facts, checkpoint.version);
  const pending = state.pending;

  if (pending !== null && compareVersions(pending.to, target) >= 0) {
    return resumedUpgrade(input, { state, pending, target });
  }

  const source = pending?.from ?? checkpoint.version;

  const completed = pending === null
    ? state.operations
    : [...state.operations, ...pending.completed];

  const resolution = resolveUpgrade({
    catalog: input.catalog,
    source,
    target,
    completed,
    facts: facts.applications.map((entry) => entry.facts),
  });

  if (resolution.status === 'current') {
    return currentUpgrade(input, { state, source, target });
  }

  if (resolution.status !== 'plan') {
    return resolutionRefusal(resolution, { source, target });
  }

  return proceed(input, {
    mode: pending === null ? 'start' : 'replan',
    state,
    pending: withPlanIdentity({
      from: source,
      to: target,
      migrations: resolution.migrations.map((migration) => migration.id),
      operations: resolution.operations,
      completed: pending?.completed ?? [],
    }),
    resolution,
  });
}

function resumedUpgrade(
  input: DecisionInput,
  plan: { state: LifecycleState; pending: PendingUpgrade; target: string },
): UpgradeDecision {
  const { state, pending, target } = plan;

  return compareVersions(pending.to, target) > 0
    ? refuse({ kind: 'downgrade', source: pending.to, target })
    : proceed(input, { mode: 'resume', state, pending, resolution: null });
}

function currentUpgrade(
  input: DecisionInput,
  plan: { state: LifecycleState; source: string; target: string },
): UpgradeDecision {
  const { state, source, target } = plan;

  const settled = input.facts.applications
    .every((entry) => entry.installed?.version === target);

  return input.facts.checkpoint.kind === 'state' && settled
    ? { kind: 'current', version: target }
    : proceed(input, {
        mode: 'start', state, pending: emptyPending(source, target), resolution: null,
      });
}

function emptyPending(from: string, to: string): PendingUpgrade {
  return withPlanIdentity({ from, to, migrations: [], operations: [], completed: [] });
}

function resolutionRefusal(
  resolution: Exclude<ReturnType<typeof resolveUpgrade>, UpgradePlan | { status: 'current' }>,
  versions: { source: string; target: string },
): UpgradeDecision {
  if (resolution.status === 'unsupported') {
    return refuse({
      kind: 'unsupported-source', source: versions.source, checkpoint: resolution.checkpoint,
    });
  }

  return resolution.status === 'downgrade'
    ? refuse({ kind: 'downgrade', ...versions })
    : refuse({
        kind: 'invalid-catalog', problems: resolution.problems.map((problem) => problem.kind),
      });
}

function proceed(
  input: DecisionInput,
  plan: {
    mode: UpgradeProceed['mode'];
    state: LifecycleState;
    pending: PendingUpgrade;
    resolution: UpgradePlan | null;
  },
): UpgradeDecision {
  const { facts } = input;
  const installs = installSteps(facts.applications, { ...input, target: plan.pending.to });

  if (!Array.isArray(installs)) {
    return installs;
  }

  return {
    kind: 'proceed',
    mode: plan.mode,
    source: plan.pending.from,
    evidence: facts.checkpoint.kind === 'bootstrap' ? facts.checkpoint.evidence : 'state',
    target: plan.pending.to,
    state: plan.state,
    pending: plan.pending,
    migrations: plan.resolution?.migrations
      ?? plan.pending.migrations.map((id) => ({ id, applications: [] })),
    suppressed: plan.resolution?.suppressed ?? [],
    inapplicable: plan.resolution?.inapplicable ?? [],
    installs,
  };
}

function installCommand(entry: UpgradeApplication, spec: string): string {
  const dev = entry.manifest!.section === 'devDependencies' ? '-D ' : '';
  const quoted = /\s/.test(spec) ? `"${spec}"` : spec;

  return entry.packageManager === 'npm'
    ? `npm install ${dev}${quoted}`
    : `${entry.packageManager} add ${dev}${quoted}`;
}

function installSteps(
  applications: UpgradeApplication[],
  input: DecisionInput & { target: string },
): InstallStep[] | UpgradeDecision {
  const steps = new Map<string, InstallStep>();

  for (const entry of applications.filter((app) => app.installed?.version !== input.target)) {
    if (entry.manifest === null) {
      return refuse({ kind: 'no-manifest', application: entry.key });
    }

    steps.set(entry.manifest.root, {
      manifest: path.relative(input.facts.root, entry.manifest.root).split(path.sep).join('/')
        || '.',
      root: entry.manifest.root,
      command: installCommand(entry, input.installSpec),
    });
  }

  return [...steps.values()];
}
