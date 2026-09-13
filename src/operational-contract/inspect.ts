import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export interface FindingView {
  severity: 'error' | 'warn' | 'info';
  rule: string;
  path: string;
  message: string;
}

export interface CoverageView {
  sourceFiles: number;
  layerFiles: number;
  outsideNets: string[];
  ignoredFiles?: string[];
  activeRules: number;
  gatedRules: number;
  testExemption?: string;
}

export interface ImportGraphFact {
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

export type BaselineErrorFact
  = | { kind: 'invalid-json' }
    | { kind: 'unexpected-shape' }
    | { kind: 'version'; found: unknown; expected: number };

const ICON = { error: '✗', warn: '⚠', info: '·' } as const;

const MIGRATION: Record<string, string> = {
  'flow-violation': 'Rework imports to follow the one-way flow; '
    + 'extract shared code down to a lower layer.',
  'canonical-alias': 'Replace the secondary alias with the canonical source-root alias.',
  'deep-import': 'Import folder units through their entry file, never their internals.',
  'relative-escape': 'Replace cross-unit relative imports with the project alias.',
  'package-ownership': 'Move restricted package usage into its owning layer '
    + '(expose it via a hook or service).',
  'selfonly-reexport': 'Depend on selfOnly layers without re-exporting them.',
  'no-entry': 'Add the declared entry file to each folder unit so it has one public surface.',
  cycle: 'Break the import cycle — invert one dependency or extract the shared part downward.',
};

const ENFORCED_BY: Record<string, string | null> = {
  'undeclared-folder': null,
  'flow-violation': 'no-restricted-imports / blueprint/import-boundary',
  'canonical-alias': 'blueprint/import-boundary',
  'deep-import': 'no-restricted-imports / blueprint/import-boundary',
  'relative-escape': 'blueprint/relative-escape',
  'package-ownership': 'no-restricted-imports',
  'selfonly-reexport': 'no-restricted-syntax',
  'no-entry': null,
  cycle: null,
};

export function renderBaselineError(fact: BaselineErrorFact): string {
  if (fact.kind === 'invalid-json') {
    return 'Baseline file is not valid JSON — regenerate it with --update-baseline.';
  }

  if (fact.kind === 'unexpected-shape') {
    return 'Baseline file has an unexpected shape — regenerate it with --update-baseline.';
  }

  return `Baseline file is version ${JSON.stringify(fact.found)}, and this blueprint writes `
    + `version ${fact.expected} — regenerate it with --update-baseline. Older baselines `
    + 'identified a finding by its message text, so rewording one retired its entry and the '
    + 'same debt came back as new; entries are now keyed on the rule, the path and the '
    + 'subject, which a wording change does not touch. Re-keying records the same debt: '
    + 'nothing is suppressed that was not suppressed before.';
}

export function renderBaselineSummary(fact: { suppressed: number; stale: number }): string {
  const lines = [`${fact.suppressed} baselined finding(s) suppressed.`];

  if (fact.stale > 0) {
    lines.push(
      `${fact.stale} baseline entr${fact.stale === 1 ? 'y' : 'ies'} no longer occur — run --update-baseline to tighten the ratchet.`,
    );
  }

  return lines.join('\n');
}

export function renderBaselineUpdate(fact: {
  debt: number;
  informational: number;
  existed: boolean;
  file: string;
}): string {
  if (fact.debt) {
    return `Baseline updated — ${fact.debt} finding(s) recorded in ${fact.file}.`;
  }

  const note = fact.informational ? ` (${fact.informational} informational note(s) are not debt)` : '';

  return fact.existed
    ? `No debt to lock${note} — ${fact.file} removed; \`inspect --baseline\` (the gate line) now suppresses nothing.`
    : `No debt to lock${note} — no baseline needed; \`inspect --baseline\` (the gate line) treats a missing ledger as empty.`;
}

export function renderArchitectureReport(
  findings: FindingView[],
  fact: {
    topology?: 'Layer → Unit' | 'Module → Layer → Unit';
    importGraph: ImportGraphFact | null;
  },
): string {
  const derivation = renderImportGraphDerivation(fact.importGraph);

  if (!findings.length) {
    return `✓ Architecture Success — no violations found.\n\n${derivation}`;
  }

  const counts = { error: 0, warn: 0, info: 0 };

  for (const finding of findings) {
    counts[finding.severity]++;
  }

  const lines = findings.map(
    (finding) => `  ${ICON[finding.severity]} [${finding.rule}] ${finding.path}\n      ${finding.message}`,
  );

  const rules = [...new Set(findings.map((finding) => finding.rule))];

  const steps = rules.flatMap((rule) => {
    const migration = migrationStep(rule, fact.topology);

    return migration === undefined
      ? []
      : [`  - [${rule}] ${migration} ${ENFORCED_BY[rule]
          ? `(lint: ${ENFORCED_BY[rule]})`
          : '(inspect only — never appears in a lint run)'}`];
  });

  return [
    'Architecture Report',
    '',
    ...lines,
    '',
    `${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s)`,
    ...(steps.length ? ['', 'Recommended migration steps:', ...steps] : []),
    '',
    derivation,
  ].join('\n');
}

export function renderImportGraphDerivation(
  analysis: ImportGraphFact | null,
  indent = '',
): OperationalText {
  const observed = analysis === null
    ? []
    : [
        `${indent}This scan left ${analysis.unknownDynamicImports} runtime-dependent dynamic import(s)`,
        `${indent}unresolved and encountered ${analysis.parseFailures.length} file parse failure(s); neither`,
        `${indent}case becomes an edge or a verified legal dependency.`,
      ];

  return operationalText([
    `${indent}How this graph was read: static import/export and quoted require targets come from`,
    `${indent}source syntax; dynamic import targets come from a parsed AST and lexical scope when`,
    `${indent}they reduce to a proven string (including immutable local strings, concatenation, and`,
    `${indent}template substitution). Runtime-dependent expressions, individual names behind`,
    `${indent}\`import * as\`, and import-like text inside a string remain outside the graph — read`,
    `${indent}it as a survey, not as the last word on any one import. ESLint applies the same bounded`,
    `${indent}dynamic evaluation while enforcing architectural boundaries.`,
    ...observed,
  ]);
}

function migrationStep(
  rule: string,
  topology?: 'Layer → Unit' | 'Module → Layer → Unit',
): string | undefined {
  if (rule !== 'undeclared-folder') {
    return MIGRATION[rule];
  }

  if (topology === undefined) {
    return 'Move undeclared folders into the declared architecture topology, '
      + 'or ask the owner to update the architecture config.';
  }

  return `Move undeclared folders into the declared ${topology} topology, `
    + 'or ask the owner to update the architecture config.';
}

const OUTSIDE_NAMED_MAX = 5;

export function renderCoverageSummary(coverage: CoverageView): string {
  const outside = coverage.outsideNets;

  const named = outside.length === 0
    ? ''
    : outside.length > OUTSIDE_NAMED_MAX
      ? ` (${outside.length} outside — too many to name; outside the declared architecture lint nets)`
      : ` (outside: ${outside.join(', ')} — outside the declared architecture lint nets)`;

  const ignored = coverage.ignoredFiles === undefined || coverage.ignoredFiles.length === 0
    ? ''
    : coverage.ignoredFiles.length > OUTSIDE_NAMED_MAX
      ? ` (${coverage.ignoredFiles.length} lint ignored — too many to name)`
      : ` (lint ignored: ${coverage.ignoredFiles.join(', ')})`;

  const reach = coverage.ignoredFiles === undefined
    ? 'source files inside architecture nets'
    : 'source files reached by layer lint rules';

  return `${coverage.layerFiles}/${coverage.sourceFiles} ${reach}${ignored}${named} · `
    + `${coverage.activeRules}/${coverage.gatedRules} optional gates active `
    + '(structural boundary rules are always on)';
}

export function renderCoverageReport(
  coverage: CoverageView,
  nextStep: string,
): string {
  const exemption = coverage.testExemption === undefined ? '' : `\n· ${coverage.testExemption}`;

  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0
    && (coverage.ignoredFiles?.length ?? 0) === 0) {
    return `⚠ Enforcement is vacuous — architecture globs match 0 of ${coverage.sourceFiles} source `
      + `file(s); a green gate proves nothing yet — ${nextStep}.${exemption}`;
  }

  return `Coverage: ${renderCoverageSummary(coverage)}${exemption}`;
}

export function renderVacuousNextStep(fact: {
  topology: 'layer-first' | 'module-first';
  directory: string;
}): string {
  const destination = fact.topology === 'module-first'
    ? 'a declared module and layer'
    : 'a declared layer';

  return `next: move code into ${destination} (e.g. ${fact.directory}) and the net arms itself`;
}

export function renderInspectOutput(fact: {
  architecture: string;
  coverage: string;
}): OperationalText {
  return operationalText(`${fact.architecture}\n\n${fact.coverage}`);
}

export function renderBaselineGateOutput(fact: {
  architecture: string;
  baseline: string;
  coverage: string;
}): OperationalText {
  return operationalText(`${fact.architecture}\n\n${fact.baseline}\n${fact.coverage}`);
}

export function renderTestExemptionOutput(exemption: string): OperationalText {
  return operationalText(`· ${exemption}`);
}
