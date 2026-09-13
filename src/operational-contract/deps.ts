import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export interface DependencyUnitFact {
  unit: string;
  importedBy: string[];
  imports: string[];
  fileLayer: boolean;
}

export function renderDependencyTestExemption(cause: string): string {
  return `${cause} — and the blast radius above is counted under the net as written, so `
    + 'nothing in it was exempted through them';
}

export function renderUnknownDependencyTarget(fact: {
  key: string;
  outsideFolder?: string;
}): OperationalText {
  return operationalText(fact.outsideFolder
    ? `✗ "${fact.outsideFolder}/" is outside the declared architecture — deps only sees governed units.`
    : `✗ Unknown unit "${fact.key}" — run \`blueprint deps\` to list every unit.`);
}

export function renderDependencyUnit(
  entry: DependencyUnitFact,
  fact: { testExemption: string | null; derivation: string },
): OperationalText {
  return operationalText([
    entry.unit + (entry.fileLayer ? ' (file-layout layer — answers at layer granularity)' : ''),
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((unit) => `    ← ${unit}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((unit) => `    → ${unit}`),
    ...exemptionLine(fact.testExemption),
    '',
    fact.derivation,
  ]);
}

export function renderDependencyLeaderboard(
  units: DependencyUnitFact[],
  fact: { skipped: string[]; testExemption: string | null; derivation: string },
): OperationalText {
  if (!units.length) {
    return operationalText('No units found inside the declared architecture.');
  }

  const width = String(units[0].importedBy.length).length;

  const note = fact.skipped.length
    ? [`  (outside the declared architecture, invisible to deps: ${fact.skipped.join('/, ')}/)`]
    : [];

  return operationalText([
    'Blast radius (imported-by count):',
    ...units.map(
      (entry) =>
        `  ${String(entry.importedBy.length).padStart(width)} ← ${entry.unit}`
        + (entry.fileLayer ? ' (file-layout layer)' : ''),
    ),
    ...note,
    ...exemptionLine(fact.testExemption),
    '',
    fact.derivation,
  ]);
}

function exemptionLine(testExemption: string | null): string[] {
  return testExemption === null ? [] : [`  · ${testExemption}`];
}
