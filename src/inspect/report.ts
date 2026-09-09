import { importGraphDerivation } from './scan';
import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import type { Finding, Severity } from './types';

const ICON: Record<Severity, string> = { error: '✗', warn: '⚠', info: '·' };

const MIGRATION: Record<string, string> = {
  'flow-violation': 'Rework imports to follow the one-way flow; '
    + 'extract shared code down to a lower layer.',
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
  'flow-violation': 'no-restricted-imports',
  'deep-import': 'no-restricted-imports',
  'relative-escape': 'blueprint/relative-escape',
  'package-ownership': 'no-restricted-imports',
  'selfonly-reexport': 'no-restricted-syntax',
  'no-entry': null,
  cycle: null,
};

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function report(findings: Finding[], architecture?: ArchitectureDef): string {
  if (!findings.length) {
    return `✓ Architecture Success — no violations found.\n\n${importGraphDerivation()}`;
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
    const migration = migrationStep(rule, architecture);

    if (migration === undefined) {
      return [];
    }

    const lint = ENFORCED_BY[rule];

    return [`  - [${rule}] ${migration} `
      + (lint ? `(lint: ${lint})` : '(inspect only — never appears in a lint run)')];
  });

  return [
    'Architecture Report',
    '',
    ...lines,
    '',
    `${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s)`,
    ...(steps.length ? ['', 'Recommended migration steps:', ...steps] : []),
    '',
    importGraphDerivation(),
  ].join('\n');
}

function migrationStep(rule: string, architecture?: ArchitectureDef): string | undefined {
  if (rule !== 'undeclared-folder') {
    return MIGRATION[rule];
  }

  if (architecture === undefined) {
    return 'Move undeclared folders into the declared architecture topology, '
      + 'or ask the owner to update the architecture config.';
  }

  const topology = resolveArchitecture(architecture).topology === 'module-first'
    ? 'Module → Layer → Unit'
    : 'Layer → Unit';

  return `Move undeclared folders into the declared ${topology} topology, `
    + 'or ask the owner to update the architecture config.';
}
