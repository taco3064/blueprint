import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type UpgradeSourceEvidence
  = | 'state'
    | 'installed-package'
    | 'state-never-committed';

export interface UpgradeInstallFact {
  manifest: string;
  command: string;
}

export interface UpgradePlanFact {
  dryRun: boolean;
  mode: 'start' | 'resume' | 'replan';
  source: string;
  evidence: UpgradeSourceEvidence;
  target: string;
  applications: { key: string; installed: string }[];
  installs: UpgradeInstallFact[];
  migrations: { id: string; applications: string[] }[];
  operations: { id: string; introducedIn: string; applications: string[]; completed: boolean }[];
  suppressed: { id: string; relation: 'cancel' | 'supersede'; by: string }[];
  inapplicable: string[];
  safety: { repository: boolean; changes: string[]; required: boolean };
}

const EVIDENCE: Record<UpgradeSourceEvidence, string> = {
  state: 'recorded in .blueprint-lifecycle.json',
  'installed-package': 'installed @kekkai/blueprint; no lifecycle state yet, so this run '
    + 'establishes it',
  'state-never-committed': 'installed @kekkai/blueprint; no commit reachable from any ref holds '
    + '.blueprint-lifecycle.json, so no lifecycle is proven and this run establishes it',
};

const scope = (applications: string[]) => applications.map((key) => `\`${key}\``).join(', ');

function installLines(fact: UpgradePlanFact): string[] {
  return fact.installs.length
    ? fact.installs.map((install) => `  Dependency: \`${install.command}\` in \`${install.manifest}\` `
      + '(the detected package manager owns the manifest and lockfile)')
    : [`  Dependency: every adopted application already has @kekkai/blueprint ${fact.target}`];
}

function operationLines(fact: UpgradePlanFact): string[] {
  if (!fact.operations.length) {
    return ['  Semantic operations for the coding Agent: none — every change in this interval is '
      + 'deterministic'];
  }

  return [
    `  Semantic operations for the coding Agent, resolved across (${fact.source}, ${fact.target}]:`,
    ...fact.operations.map((operation, index) => `    ${index + 1}. ${operation.id} `
      + `(${operation.introducedIn}) → ${scope(operation.applications)}`
      + `${operation.completed ? ' — already completed; not repeated' : ''}`),
  ];
}

function resolutionLines(fact: UpgradePlanFact): string[] {
  return [
    ...fact.suppressed.map((entry) => `  Removed from the plan: ${entry.id} — `
      + `${entry.relation === 'cancel' ? 'canceled' : 'superseded'} by ${entry.by}`),
    ...fact.inapplicable.map((id) => `  Not applicable here: ${id}`),
  ];
}

function safetyLine(fact: UpgradePlanFact): string {
  if (!fact.safety.required) {
    return '  Safety: resuming the recorded pending upgrade; uncommitted upgrade work is expected';
  }

  if (!fact.safety.repository) {
    return '  Safety: ✗ starting an upgrade requires a Git worktree so every change stays '
      + 'recoverable';
  }

  return fact.safety.changes.length
    ? `  Safety: ✗ starting an upgrade requires a clean Git worktree — uncommitted: ${fact.safety.changes.join(', ')}`
    : '  Safety: ✓ clean Git worktree — every change stays recoverable';
}

export function renderUpgradePlan(fact: UpgradePlanFact): OperationalText {
  const heading = fact.dryRun
    ? 'Blueprint upgrade — dry run (nothing was changed)'
    : `Blueprint upgrade — ${fact.mode === 'resume' ? 'resuming the pending upgrade' : 'plan'}`;

  return operationalText([
    heading,
    `  Source: ${fact.source} (${EVIDENCE[fact.evidence]})`,
    `  Target: ${fact.target} (the running @kekkai/blueprint package is the only target authority)`,
    `  Applications: ${fact.applications.map((app) => `\`${app.key}\` (installed ${app.installed})`).join(', ')}`,
    ...installLines(fact),
    fact.migrations.length
      ? `  Deterministic migrations (run in code through \`blueprint init\`): ${fact.migrations
        .map((migration) => migration.applications.length
          ? `${migration.id} → ${scope(migration.applications)}`
          : migration.id).join('; ')}`
      : '  Deterministic migrations: none beyond regenerating Blueprint outputs through '
        + '`blueprint init`',
    ...operationLines(fact),
    ...resolutionLines(fact),
    safetyLine(fact),
    ...(fact.dryRun ? ['  Next: re-run without --dry-run to apply this plan.'] : []),
  ]);
}

export function renderUpgradeCurrent(version: string): OperationalText {
  return operationalText(`Blueprint lifecycle ${version} is current — nothing to upgrade. Run `
    + '`blueprint init` to repair generated integration and `blueprint doctor` to verify it.');
}

export function renderUpgradeStateRecorded(
  file: string,
  source: string,
  target: string,
): OperationalText {
  return operationalText(`  ✓ write: ${file} (pending upgrade ${source} → ${target} recorded before `
    + 'any other change; if this run is interrupted, re-run `blueprint upgrade` to resume)');
}

export function renderUpgradeInstallStarting(command: string, manifest: string): OperationalText {
  return operationalText(`  → install: \`${command}\` in \`${manifest}\` — moving the project `
    + 'dependency to the running target');
}

export function renderUpgradeHandoff(version: string): OperationalText {
  return operationalText(`  → continuing with the project-installed @kekkai/blueprint ${version}, `
    + 'so every config load and generated output uses the upgraded package');
}

export function renderUpgradeReconcile(application: string): OperationalText {
  return operationalText(`Reconciling \`${application}\` through \`blueprint init\` (deterministic `
    + 'migrations and generated outputs):');
}

export function renderUpgradePlaybookWritten(file: string, remaining: number): OperationalText {
  return operationalText(`Upgrade pending — ${remaining} semantic operation(s) need the coding `
    + `Agent. Follow ${file}, complete each with \`npx blueprint upgrade --complete <operation-id>\`, `
    + 'then re-run `npx blueprint upgrade`. The lifecycle checkpoint does not move until '
    + 'verification passes.');
}

export interface UpgradeVerificationFact {
  application: string;
  inspect: { ok: boolean; findings: number };
  doctor: {
    verdict: 'complete' | 'unverified' | 'incomplete';
    failed: string[];
    skipped: string[];
  };
}

export function renderUpgradeVerificationResult(fact: UpgradeVerificationFact): OperationalText {
  const app = `\`${fact.application}\``;

  const inspect = fact.inspect.ok
    ? `  ✓ inspect --baseline passed in ${app}`
    : `  ✗ inspect --baseline failed in ${app} (${fact.inspect.findings} finding(s) outside the `
      + 'baseline) — run `npx blueprint inspect --baseline` there; fix regressions, record only '
      + 'understood pre-existing debt, and never lower a rule to reach green';

  const doctor = fact.doctor.verdict === 'complete'
    ? `  ✓ doctor complete in ${app}`
    : `  ✗ doctor ${fact.doctor.verdict} in ${app}${fact.doctor.failed.length
      ? ` — failed: ${fact.doctor.failed.join('; ')}`
      : ''}${fact.doctor.skipped.length ? ` — could not run: ${fact.doctor.skipped.join('; ')}` : ''}`
      + ' — run `npx blueprint doctor` there; the upgrade stays pending until it reports complete';

  return operationalText([inspect, doctor]);
}

export function renderUpgradeVerificationPending(): OperationalText {
  return operationalText('Upgrade pending — verification did not pass. Fix what is listed above, '
    + 'then re-run `npx blueprint upgrade`; the lifecycle checkpoint stays where it was.');
}

export function renderUpgradeComplete(source: string, target: string): OperationalText {
  return operationalText(`Blueprint upgrade complete: lifecycle ${source} → ${target} recorded after `
    + '`blueprint inspect --baseline` and `blueprint doctor` passed in every adopted application. '
    + 'Run the project\'s own lint, typecheck, test, and build commands before committing.');
}

export function renderUpgradeOperationCompleted(id: string, remaining: number): OperationalText {
  return operationalText(`  ✓ operation ${id} recorded as complete — ${remaining} semantic `
    + `operation(s) remain${remaining ? '' : '; run `npx blueprint upgrade` to verify and finish'}`);
}
