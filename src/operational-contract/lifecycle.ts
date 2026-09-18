import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type LifecycleEstablishment = 'first' | 'bootstrap' | 'records-only' | null;

export type LifecycleRecordSkip = 'unproven-checkpoint' | 'pending-upgrade' | 'missing-state';

const NOTES: Record<string, string> = {
  first: '(lifecycle checkpoint and Blueprint ownership records — commit it; `blueprint upgrade` '
    + 'and `blueprint remove` read it)',
  bootstrap: '(lifecycle checkpoint established from the installed package; edits made before '
    + 'this run were not recorded, so `blueprint remove` reports them as residues instead of '
    + 'reversing them)',
  'records-only': '(Blueprint ownership records for what this run wrote; the lifecycle checkpoint '
    + 'stays unestablished because adoption did not finish — re-run `blueprint init` to finish it)',
};

export function renderLifecycleRecordNote(
  file: string,
  established: LifecycleEstablishment,
): OperationalText {
  const note = NOTES[String(established)]
    ?? '(Blueprint ownership records — upgrade and remove reverse only what these records prove)';

  return operationalText(`${file} ${note}`);
}

const SKIPPED: Record<LifecycleRecordSkip, string> = {
  'pending-upgrade': 'Lifecycle state not recorded — blueprint-upgrade.md shows an upgrade in '
    + 'progress, but .blueprint-lifecycle.json is missing. Restore .blueprint-lifecycle.json from '
    + 'version control, then re-run; Blueprint does not reconstruct upgrade history it cannot '
    + 'prove.',
  'missing-state': 'Lifecycle state not recorded — this repository runs a Blueprint that always '
    + 'writes .blueprint-lifecycle.json, so a missing file is lost history, not a fresh adoption. '
    + 'Restore it from version control; Blueprint does not rebuild it from the installed package.',
  'unproven-checkpoint': 'Lifecycle state not recorded — the installed @kekkai/blueprint version '
    + 'could not be read, so no lifecycle checkpoint can be proven. Install dependencies and '
    + 're-run init so `blueprint upgrade` and `blueprint remove` can rely on recorded ownership.',
};

export function renderLifecycleRecordSkipped(reason: LifecycleRecordSkip): OperationalText {
  return operationalText(SKIPPED[reason]);
}

export function renderLifecycleStateMissing(file: string, installed: string): OperationalText {
  return operationalText(`${file} is missing, and @kekkai/blueprint ${installed} always writes `
    + 'it. Blueprint stops instead of rebuilding ownership history it cannot prove. Restore the '
    + `file from version control (for example \`git checkout -- ${file}\`), then re-run this `
    + 'command.');
}

const STATE_REASONS: Record<string, string> = {
  json: 'it is not valid JSON',
  schema: 'its schema is not one this Blueprint reads',
};

export function renderLifecycleStateInvalid(file: string, reason: string): OperationalText {
  const cause = STATE_REASONS[reason] ?? `its \`${reason}\` field is invalid`;

  return operationalText(`${file} is unreadable: ${cause}. Blueprint stops instead of guessing `
    + 'lifecycle history or file ownership. Restore it from version control (for example '
    + `\`git checkout -- ${file}\`), then re-run this command.`);
}
