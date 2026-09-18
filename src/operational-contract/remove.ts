import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type RemoveReasonFact
  = | 'config'
    | 'lifecycle-state'
    | 'baseline'
    | 'workflow'
    | 'reference'
    | 'backup'
    | 'generated'
    | 'created'
    | 'section'
    | 'edit'
    | 'script'
    | 'gitignore'
    | 'directory';

export type RemoveActionFact
  = | { kind: 'delete' | 'write' | 'rmdir'; path: string; reason: RemoveReasonFact }
    | { kind: 'ref'; ref: string; application: string };

export type RemoveResidueFact
  = | { kind: 'required-by-source'; path: string; alias: string }
    | { kind: 'modified' | 'emptied' | 'directory-in-use'; path: string }
    | { kind: 'unrecorded'; path: string; detail: 'alias' | 'lint-script' }
    | { kind: 'unrecorded-folder'; path: string }
    | {
      kind: 'dependency-kept';
      name: string;
      manifest: string;
      reason: 'referenced' | 'shared' | 'unrecorded';
    };

export interface RemovePlanFact {
  dryRun: boolean;
  mode: 'provenance' | 'partial' | 'legacy';
  applications: string[];
  remaining: string[];
  actions: RemoveActionFact[];
  residues: RemoveResidueFact[];
  uninstall: { manifest: string; command: string }[];
}

const REASONS: Record<RemoveReasonFact, string> = {
  config: 'Blueprint architecture config',
  'lifecycle-state': 'Blueprint lifecycle state',
  baseline: 'Blueprint inspect baseline',
  workflow: 'unfinished Blueprint workflow artifact',
  reference: 'Blueprint merge reference',
  backup: 'Blueprint 3.2 config backup',
  generated: 'Blueprint-generated output',
  created: 'created by Blueprint and unchanged since',
  section: 'Blueprint-managed section; content outside the markers is kept',
  edit: 'reverses the exact recorded Blueprint edit',
  script: 'restores the package script Blueprint changed',
  gitignore: 'removes Blueprint\'s marked ignore exceptions',
  directory: 'empty layer folder Blueprint created',
};

const MODES = {
  provenance: 'lifecycle records prove every Blueprint-owned file and shared-file edit',
  partial: 'lifecycle records started after adoption, so older shared-file edits are reported, '
    + 'not reversed',
  legacy: 'no lifecycle records, so only name- or content-proven Blueprint artifacts are removed',
};

function actionLine(action: RemoveActionFact, mark: string): string {
  if (action.kind === 'ref') {
    return `${mark} delete Git ref ${action.ref} (retained transformation origin `
      + `for \`${action.application}\`)`;
  }

  const verb = action.kind === 'write'
    ? 'rewrite'
    : action.kind === 'rmdir'
      ? 'remove folder'
      : 'delete';

  return `${mark} ${verb} ${action.path} (${REASONS[action.reason]})`;
}

export function renderRemoveAction(
  action: RemoveActionFact,
  mode: 'dry-run' | 'applied',
): OperationalText {
  return operationalText(actionLine(action, mode === 'dry-run' ? '  would' : '  ✓'));
}

function residueLine(residue: RemoveResidueFact): string {
  switch (residue.kind) {
    case 'required-by-source':
      return `${residue.path}: application source still imports \`${residue.alias}\`, so this `
        + 'alias wiring is ordinary project wiring now';
    case 'modified':
      return `${residue.path}: Blueprint created it, but it changed since`;
    case 'emptied':
      return `${residue.path}: held only Blueprint's managed section and is now empty; kept `
        + 'because nothing proves Blueprint created the file — delete it if the project does not '
        + 'need it';
    case 'directory-in-use':
      return `${residue.path}: Blueprint created this folder, but it now holds project files`;
    case 'unrecorded-folder':
      return `${residue.path}: holds only .gitkeep, as Blueprint's layer scaffold leaves it; it `
        + 'predates lifecycle records';
    case 'unrecorded':
      return `${residue.path}: may still carry Blueprint's ${residue.detail === 'alias'
        ? 'import-alias wiring'
        : 'eslint leg in the lint script'}; it predates lifecycle records`;
    default:
      return `${residue.name} in ${residue.manifest}: ${residue.reason === 'shared'
        ? 'adopted applications outside this removal still use it'
        : residue.reason === 'referenced'
          ? 'remaining project files still reference it'
          : 'Blueprint may have installed it, but no record proves that'}`;
  }
}

export function renderRemovePlan(fact: RemovePlanFact): OperationalText {
  const scope = fact.applications.map((key) => `\`${key}\``).join(', ');

  return operationalText([
    fact.dryRun ? 'Blueprint remove — dry run (nothing was changed)' : 'Blueprint remove — plan',
    `  Scope: ${scope}${fact.remaining.length
      ? `; still adopted and kept: ${fact.remaining.map((key) => `\`${key}\``).join(', ')}`
      : ' — the whole repository'}`,
    `  Ownership evidence: ${MODES[fact.mode]}`,
    ...(fact.actions.length ? ['  Remove:'] : ['  Remove: nothing Blueprint-owned remains']),
    ...fact.actions.map((action) => actionLine(action, '    −')),
    ...(fact.residues.length ? ['  Kept for you to review:'] : []),
    ...fact.residues.map((residue) => `    · ${residueLine(residue)}`),
    ...(fact.uninstall.length
      ? fact.uninstall.map((step) => `  Dependency, removed last: \`${step.command}\` in \`${step.manifest}\``)
      : ['  Dependency: nothing to uninstall here']),
    ...(fact.dryRun ? ['  Next: re-run without --dry-run to apply this plan.'] : []),
  ]);
}

export function renderRemoveEmptyDirectory(directory: string): OperationalText {
  return operationalText(`  ✓ remove folder ${directory} (left empty by removing Blueprint files)`);
}

export function renderRemoveUninstall(command: string, manifest: string): OperationalText {
  return operationalText(`  → uninstall: \`${command}\` in \`${manifest}\` — last, after nothing `
    + 'left needs the package');
}

export function renderRemoveComplete(leftovers: readonly string[]): OperationalText {
  return operationalText(leftovers.length
    ? [
        'Blueprint remove incomplete — these Blueprint artifacts are still present:',
        ...leftovers.map((file) => `  ✗ ${file}`),
        'Remove them, or re-run `npx blueprint remove` if the package is still installed.',
      ]
    : 'Blueprint removed: no proven Blueprint config, lifecycle, generated, managed, or dependency '
      + 'footprint remains in scope. Review anything listed as kept, then run the project\'s own '
      + 'lint, typecheck, test, and build.');
}
