import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type RemoveConflictFact
  = | { kind: 'malformed-section'; path: string }
    | { kind: 'ambiguous-edit'; path: string; occurrences: number }
    | {
      kind: 'diverged-script';
      path: string;
      name: string;
      expected: string;
      current: string | null;
    }
    | { kind: 'unreadable-manifest'; path: string }
    | { kind: 'irreversible-edit'; path: string }
    | {
      kind: 'reference';
      path: string;
      detail: 'import' | 'config-path' | 'script';
      name?: string;
    };

export type RemoveRefusalFact
  = | { kind: 'not-adopted'; root: string }
    | { kind: 'missing-state'; file: string; installed: string }
    | { kind: 'pending-upgrade'; file: string; applications: string[] };

function conflictLine(fact: RemoveConflictFact): string {
  switch (fact.kind) {
    case 'malformed-section':
      return `${fact.path}: its BLUEPRINT:START/END markers are unbalanced or repeated — restore `
        + 'one complete managed section, or delete the markers and the text between them';
    case 'ambiguous-edit':
      return `${fact.path}: text Blueprint inserted now appears ${fact.occurrences} times, so the `
        + 'exact reversal is ambiguous — keep a single copy, then re-run';
    case 'diverged-script':
      return `${fact.path}: scripts.${fact.name} is ${fact.current === null ? 'missing or not text' : `"${fact.current}"`}, `
        + `not the value Blueprint wrote ("${fact.expected}") — restore Blueprint's value or your `
        + 'pre-Blueprint value, re-run, and change the script afterwards';
    case 'unreadable-manifest':
      return `${fact.path}: not valid JSON, so the recorded script change cannot be reversed — `
        + 'fix the JSON first';
    case 'irreversible-edit':
      return `${fact.path}: Blueprint recorded removing text here, and the record alone cannot `
        + 'prove where it belongs — restore the file from version control, or reverse that edit by '
        + 'hand, then re-run';
    default:
      return referenceLine(fact);
  }
}

function referenceLine(fact: Extract<RemoveConflictFact, { kind: 'reference' }>): string {
  if (fact.detail === 'script') {
    return `${fact.path}: script "${fact.name}" still runs Blueprint — remove or replace it first`;
  }

  return fact.detail === 'import'
    ? `${fact.path}: still imports @kekkai/blueprint — remove its Blueprint wiring (for example `
    + 'the emitLint entries) before the package is uninstalled'
    : `${fact.path}: still loads a blueprint.config.mjs that removal deletes — remove that wiring first`;
}

export function renderRemoveConflicts(conflicts: readonly RemoveConflictFact[]): OperationalText {
  return operationalText([
    `remove stopped before changing anything: ${conflicts.length} ownership conflict(s) would make `
    + 'a partial or unsafe cleanup. Resolve each one, then re-run '
    + '`npx blueprint remove --dry-run`.',
    ...conflicts.map((conflict) => `  ✗ ${conflictLine(conflict)}`),
  ]);
}

const REFUSALS: Record<RemoveRefusalFact['kind'], (fact: never) => string> = {
  'not-adopted': (fact: Extract<RemoveRefusalFact, { kind: 'not-adopted' }>) =>
    `no adopted application was found at or below ${fact.root}. Run \`blueprint remove\` from `
    + 'the repository or from the adopted application you want to de-adopt. Nothing was changed.',
  'missing-state': (fact: Extract<RemoveRefusalFact, { kind: 'missing-state' }>) =>
    `${fact.file} is missing, but @kekkai/blueprint ${fact.installed} always records it, so `
    + 'ownership of shared-file edits cannot be proven. Restore it from version control (for '
    + `example \`git checkout -- ${fact.file}\`). Blueprint does not rebuild the records, so `
    + 'removal has nothing to reverse from. Nothing was changed.',
  'pending-upgrade': (fact: Extract<RemoveRefusalFact, { kind: 'pending-upgrade' }>) =>
    `${fact.file} records an upgrade in progress, and ${fact.applications.join(', ')} stay `
    + 'adopted. Removing part of the repository now would leave that upgrade pointing at an '
    + 'application that no longer exists. Finish or abandon the upgrade first — `npx '
    + '@kekkai/blueprint@latest upgrade`, or remove the whole repository adoption. Nothing was '
    + 'changed.',
};

export function renderRemoveRefusal(fact: RemoveRefusalFact): OperationalText {
  return operationalText(REFUSALS[fact.kind](fact as never));
}
