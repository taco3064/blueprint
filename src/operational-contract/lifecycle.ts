import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type LifecycleEstablishment = 'first' | 'bootstrap' | null;

export type LifecycleRecordSkip = 'unproven-checkpoint' | 'pending-upgrade';

export function renderLifecycleRecordNote(
  file: string,
  established: LifecycleEstablishment,
): OperationalText {
  if (established === 'first') {
    return operationalText(`${file} (lifecycle checkpoint and Blueprint ownership records — `
      + 'commit it; `blueprint upgrade` and `blueprint remove` read it)');
  }

  if (established === 'bootstrap') {
    return operationalText(`${file} (lifecycle checkpoint established from the installed `
      + 'package; edits made before this run were not recorded, so `blueprint remove` reports '
      + 'them as residues instead of reversing them)');
  }

  return operationalText(`${file} (Blueprint ownership records — upgrade and remove reverse `
    + 'only what these records prove)');
}

export function renderLifecycleRecordSkipped(reason: LifecycleRecordSkip): OperationalText {
  return operationalText(reason === 'pending-upgrade'
    ? 'Lifecycle state not recorded — blueprint-upgrade.md shows an upgrade in progress, but '
    + '.blueprint-lifecycle.json is missing. Restore .blueprint-lifecycle.json from version '
    + 'control, then re-run; Blueprint does not reconstruct upgrade history it cannot prove.'
    : 'Lifecycle state not recorded — the installed @kekkai/blueprint version could not be read, '
      + 'so no lifecycle checkpoint can be proven. Install dependencies and re-run init so '
      + '`blueprint upgrade` and `blueprint remove` can rely on recorded ownership.');
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
