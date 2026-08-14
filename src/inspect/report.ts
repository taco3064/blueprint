import { importGraphDerivation } from './scan';
import type { Finding, Severity } from './types';

const ICON: Record<Severity, string> = { error: '✗', warn: '⚠', info: '·' };

const MIGRATION: Record<string, string> = {
  'structure-mismatch': 'Settle the `structure` choice before any single declaration — the tree matches one model and the config declares the other, so declaring the folders as they stand goes green over a list copied off the disk. The finding names the edit for each answer.',
  'undeclared-folder': 'Move undeclared folders into a unit of an existing layer, or declare them as layers.',
  'undeclared-module': 'Declare the folder in `architecture.modules`, at a position the measured edges allow, or fold its code into a module that is already declared. Until then nothing inside it is governed and lint cannot say so.',
  'flow-violation': 'Rework imports to follow the one-way flow; extract shared code down to a lower layer.',
  'deep-import': 'Import modules through their entry file, never their internals.',
  'src-escape': 'Replace relative paths that climb above the source root with the project alias.',
  'entry-bypass': 'Import a sibling through its entry — `../Sibling`, which is the only legal spelling; the alias form of a same-layer edge is banned.',
  'layer-escape': 'Cross a layer boundary with the project alias, or move the shared code down into a lower layer.',
  'root-import': 'Stop importing the module root from inside a layer — move the shared part down into a layer, or pass it in from the root.',
  'module-escape': 'Cross a module boundary through the alias, never a relative path, and declare the dependency in the module\'s `imports`.',
  'undeclared-dependency': 'Declare the edge in the importing module\'s `imports`, or move the shared part into a module both may reach. A module may only name modules declared after it, so an edge that runs backwards is a decomposition change rather than a config one.',
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
  // No emitted rule can hold a structure choice: the config picks the vocabulary
  // every glob and ban is then expanded from, so lint runs INSIDE the answer and
  // has no position from which to question it.
  'structure-mismatch': null,
  'undeclared-folder': null,
  // Never appears in a lint run, by construction: the globs are built FROM the
  // declared list, so an undeclared folder is matched by nothing — which is
  // exactly why an agent whose loop ends at a green lint never learns of it.
  'undeclared-module': null,
  'flow-violation': 'no-restricted-imports',
  'deep-import': 'no-restricted-imports',
  'src-escape': 'blueprint/relative-escape',
  'entry-bypass': 'blueprint/relative-escape',
  'layer-escape': 'blueprint/relative-escape',
  // Two rules, because the two spellings of this one reach are caught by
  // different mechanisms: the plugin resolves a relative path, and an exact
  // `paths` entry catches the alias form. Naming only one sends a reader
  // searching the resolved config for an id that is not the one holding their
  // violation — which is the whole job of this table.
  // Three rules, because one reach has three channels and no fewer would do:
  // the plugin resolves a relative path, an exact `paths` entry catches the two
  // alias spellings a config can name, and a second plugin rule catches the
  // rest — a root component's filename among them. Naming fewer sends a reader
  // searching the resolved config for an id that is not holding their
  // violation, which is the whole job of this table.
  'root-import': 'blueprint/relative-escape for a relative path; no-restricted-imports (paths) for `~app/<Module>` and `~app/<Module>/index`; blueprint/no-module-root-import for every other alias spelling',
  'module-escape': 'blueprint/relative-escape',
  'undeclared-dependency': 'no-restricted-imports',
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

/** What a header shows of a finding's identity, spelled as the header spells it. */
function headerKey(finding: Finding): string {
  return `[${finding.rule}] ${finding.path}`;
}

/**
 * The header keys more than one finding answers to.
 *
 * A finding's identity is three-part — the baseline keys on `rule` + `path` +
 * `subject` — and a header shows the first two, so a repeated pair prints one line
 * twice for findings that are resolved separately.
 */
function repeatedHeaders(findings: Finding[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const finding of findings) {
    const key = headerKey(finding);

    if (seen.has(key)) repeated.add(key);

    seen.add(key);
  }

  return repeated;
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

  const repeated = repeatedHeaders(findings);

  // The subject joins a header only where that header repeats. Printed always, it
  // would restate a specifier the message names in a sentence one line down, on
  // every import finding in every report; printed here, no reader meets two lines
  // that read alike and has to descend into the prose to tell which is which.
  const lines = findings.map((finding) => {
    const shown = repeated.has(headerKey(finding)) && finding.subject !== ''
      ? ` — ${finding.subject}`
      : '';

    return `  ${ICON[finding.severity]} [${finding.rule}] ${finding.path}${shown}\n      ${finding.message}`;
  });

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
