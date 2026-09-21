import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type LifecycleEstablishment = 'first' | 'bootstrap' | 'records-only' | null;

export type AdoptionGap = 'install' | 'authoring';

export type LifecycleRecordSkip = 'unproven-checkpoint' | 'unproven-legacy-source'
  | 'pending-upgrade' | 'missing-state';

const NOTES: Record<string, string> = {
  first: '(lifecycle checkpoint and Blueprint ownership records — commit it; `blueprint upgrade` '
    + 'and `blueprint remove` read it)',
  bootstrap: '(lifecycle checkpoint established from the installed package; edits made before '
    + 'this run were not recorded, so `blueprint remove` reports them as residues instead of '
    + 'reversing them)',
};

const UNESTABLISHED: Record<AdoptionGap | 'unfinished', string> = {
  unfinished: 'adoption did not finish — re-run `blueprint init` to finish it',
  install: 'the dependencies adoption requires are not installed yet — install them as shown '
    + 'above, then re-run `blueprint init`',
  authoring: 'authoring is still in progress — the `blueprint init` run that finishes authoring '
    + 'establishes it',
};

function unestablished(gap: AdoptionGap | null): string {
  return '(Blueprint ownership records for what this run wrote; the lifecycle checkpoint stays '
    + `unestablished because ${UNESTABLISHED[gap ?? 'unfinished']})`;
}

export function renderLifecycleRecordNote(
  file: string,
  established: LifecycleEstablishment,
  gap: AdoptionGap | null = null,
): OperationalText {
  const note = established === 'records-only'
    ? unestablished(gap)
    : NOTES[String(established)]
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
  'unproven-legacy-source': 'Lifecycle state not recorded — the legacy config shape overlaps '
    + 'supported and unsupported 3.x releases, so it cannot prove an exact source checkpoint. '
    + 'Install Blueprint 3.2, run that release\'s init and doctor, commit the checkpoint, then '
    + 'upgrade.',
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
