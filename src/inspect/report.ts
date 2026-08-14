import { importGraphDerivation } from './scan';
import type { Finding, Severity } from './types';

const ICON: Record<Severity, string> = { error: '✗', warn: '⚠', info: '·' };

const MIGRATION: Record<string, string> = {
  'undeclared-folder': 'Move undeclared folders into a module of an existing layer, or declare them as layers.',
  'flow-violation': 'Rework imports to follow the one-way flow; extract shared code down to a lower layer.',
  'deep-import': 'Import modules through their entry file, never their internals.',
  'src-escape': 'Replace relative paths that climb above the source root with the project alias.',
  'entry-bypass': 'Import a sibling through its entry — `../Sibling`, which is the only legal spelling; the alias form of a same-layer edge is banned.',
  'layer-escape': 'Cross a layer boundary with the project alias, or move the shared code down into a lower layer.',
  'root-import': 'Stop importing the module root from inside a layer — move the shared part down into a layer, or pass it in from the root.',
  'module-escape': 'Cross a module boundary through the alias, never a relative path, and declare the dependency in the module\'s `imports`.',
  'package-ownership': 'Move restricted package usage into its owning layer (expose it via a hook or service).',
  'selfonly-reexport': 'Depend on selfOnly layers without re-exporting them.',
  'module-reexport': 'Stop forwarding another module\'s surface: let the consumer declare that module itself, or expose this module\'s own API instead. A function that only forwards the call clears the rule and builds nothing.',
  'no-entry': 'Add an entry (index) file to each module so it has a single public surface.',
  cycle: 'Break the import cycle — invert one dependency or extract the shared part downward.',
};

/**
 * The ESLint rule each finding resolves into — the bridge between inspect's
 * diagnostic names and what `--print-config` shows, since most structural bans fold
 * into ONE rule (field issue #48). `null` marks what inspect enforces by itself.
 */
const ENFORCED_BY: Record<string, string | null> = {
  'undeclared-folder': null,
  'flow-violation': 'no-restricted-imports',
  'deep-import': 'no-restricted-imports',
  'src-escape': 'blueprint/relative-escape',
  'entry-bypass': 'blueprint/relative-escape',
  'layer-escape': 'blueprint/relative-escape',
  'root-import': 'blueprint/relative-escape',
  'module-escape': 'blueprint/relative-escape',
  'package-ownership': 'no-restricted-imports',
  'selfonly-reexport': 'no-restricted-syntax',
  'module-reexport': 'blueprint/no-module-reexport',
  'no-entry': null,
  cycle: null,
};

/** True when any finding is an error (drives the CLI exit code). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

/**
 * Render findings as a human-readable Architecture Report with migration steps.
 *
 * The derivation note closes every report, the clean one included — that is the one
 * this exists for. Six of the ten findings above are read out of an import graph
 * built from source text, so `✓ Architecture Success` is a verdict on what a text
 * scan could see, and it is the output most likely to be read as more than that.
 */
export function report(findings: Finding[]): string {
  if (!findings.length) {
    return `✓ Architecture Success — no violations found.\n\n${importGraphDerivation()}`;
  }

  const counts = { error: 0, warn: 0, info: 0 };

  for (const finding of findings) counts[finding.severity]++;

  const lines = findings.map(
    (finding) => `  ${ICON[finding.severity]} [${finding.rule}] ${finding.path}\n      ${finding.message}`,
  );

  const rules = [...new Set(findings.map((finding) => finding.rule))];

  // Each step names its finding and where that finding is enforced — three
  // channels called one violation three things, and the third (a resolved
  // eslint config) had no name for it at all.
  const steps = rules.filter((rule) => rule in MIGRATION).map((rule) => {
    const lint = ENFORCED_BY[rule];

    return `  - [${rule}] ${MIGRATION[rule]} `
      + (lint ? `(lint: ${lint})` : '(inspect only — never appears in a lint run)');
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
