import type { Finding, Severity } from './types';

const ICON: Record<Severity, string> = { error: '✗', warn: '⚠', info: '·' };

const MIGRATION: Record<string, string> = {
  'undeclared-folder': 'Move undeclared folders into a module of an existing layer, or declare them as layers.',
  'flow-violation': 'Rework imports to follow the one-way flow; extract shared code down to a lower layer.',
  'deep-import': 'Import modules through their entry file, never their internals.',
  'relative-escape': 'Replace cross-module relative imports with the project alias.',
  'package-ownership': 'Move restricted package usage into its owning layer (expose it via a hook or service).',
  'selfonly-reexport': 'Depend on selfOnly layers without re-exporting them.',
  'no-entry': 'Add an entry (index) file to each module so it has a single public surface.',
  cycle: 'Break the import cycle — invert one dependency or extract the shared part downward.',
};

/** True when any finding is an error (drives the CLI exit code). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

/** Render findings as a human-readable Architecture Report with migration steps. */
export function report(findings: Finding[]): string {
  if (!findings.length) {
    return '✓ Architecture Success — no violations found.';
  }

  const counts = { error: 0, warn: 0, info: 0 };

  for (const finding of findings) counts[finding.severity]++;

  const lines = findings.map(
    (finding) => `  ${ICON[finding.severity]} [${finding.rule}] ${finding.path}\n      ${finding.message}`,
  );

  const rules = [...new Set(findings.map((finding) => finding.rule))];
  const steps = rules.filter((rule) => rule in MIGRATION).map((rule) => `  - ${MIGRATION[rule]}`);

  return [
    'Architecture Report',
    '',
    ...lines,
    '',
    `${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s)`,
    ...(steps.length ? ['', 'Recommended migration steps:', ...steps] : []),
  ].join('\n');
}
