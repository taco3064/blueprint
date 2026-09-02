import type { SurveyResult } from './survey';

/**
 * The survey's human-readable report. Its own satellite because every function here
 * writes one section of one document, and the walk that produced the numbers is a
 * separate concern from how they are said.
 */
/**
 * Wrap a comma-joined list to `width`, at the given indent. The survey hand-wraps every
 * other line it prints; a list whose length is the reader's repo cannot be hand-wrapped.
 */
function wrapList(items: string[], width: number, indent: string): string[] {
  const lines: string[] = [];

  for (const item of items) {
    const last = lines.length - 1;
    const candidate = lines.length ? `${lines[last]} ${item},` : `${indent}${item},`;

    if (lines.length && candidate.length <= width) {
      lines[last] = candidate;
    } else {
      lines.push(`${indent}${item},`);
    }
  }

  return lines.map((line, index) => (index === lines.length - 1 ? line.replace(/,$/, '') : line));
}

/** The human-readable survey report. */
export function renderSurvey(result: SurveyResult): string {
  return [
    ...headerLines(result),
    ...folderLines(result),
    ...importMatrixLines(result),
    ...selfAliasLines(result),
    ...testConventionLines(result),
    ...packageUsageLines(result),
    ...ownableImportLines(result),
    ...unresolvedLines(result),
  ].join('\n');
}

/** The stack line, the detected alias, and the root files that are wiring, not layers. */
function headerLines(result: SurveyResult): string[] {
  const aliasEntries = Object.entries(result.aliases);

  return [
    `Survey · ${result.framework ?? 'unknown framework'}${result.typescript ? ' + typescript' : ''} · ${result.packageManager} · ${result.totalFiles} source files`,
    '',
    aliasEntries.length
      ? `Alias: ${aliasEntries.map(([alias, dir]) => `${alias} → ${dir}`).join(', ')}`
      : 'Alias: none detected in tsconfig paths — pass --alias <name> if the project has one.',
    '',
    ...(result.rootFiles.length
      ? [`src/ root files (wiring, not layers): ${result.rootFiles.join(', ')}`, '']
      : []),
  ];
}

/**
 * The module-shape evidence. A bare heading over nothing reads as a render failure —
 * say "none" (field issue #6). Same below for the import matrix.
 */
function folderLines(result: SurveyResult): string[] {
  const rows = result.folders.map(
    (folder) =>
      `  ${folder.folder.padEnd(16)} ${String(folder.files).padStart(4)} source files · ${folder.directFiles} direct · ${folder.childFolders} child folders (${folder.indexedChildren} with index) · depth ${folder.maxDepth}`,
  );

  return [
    'Folders (module-shape evidence):',
    ...rows,
    ...sourcelessNote(result),
    ...(rows.length ? [] : ['  — none —']),
  ];
}

/**
 * Every row said "N files", and a row exists BECAUSE its folder does — so `0` read as
 * an empty folder, which is the one thing it cannot mean. An adopter took
 * `styles 0 files` for empty, ran `ls`, and found a directory of `.css` (field run
 * #150). Once, under the block, not per row: the same reason the row itself does not
 * repeat it — N copies of one sentence bury the numbers they sit beside.
 */
function sourcelessNote(result: SurveyResult): string[] {
  const sourceless = result.folders.filter((folder) => folder.files === 0);

  if (!sourceless.length) {
    return [];
  }

  // A blank line and no `  name` opening, because both were there: the note ran at the
  // rows' own indent with no gap, and its first line began with the folder list — so
  // `assets, styles: 0 source files means the` read as a fourth row for a folder called
  // "assets, styles". Every other section here opens on a blank line for the same
  // reason. The list wraps at 74 too: `public/ assets/ locales/ generated/` is one
  // ordinary project, and it was the only line in this output nothing bounded.
  return [
    '',
    '  0 source files means the folder is HERE and holds none — not that it is empty.',
    // Not a parenthetical list of content KINDS directly above a list of folder
    // NAMES: on a repo with `assets/` and `styles/` the two read as the same list
    // twice, and the words were identical. Dashes instead of parentheses, kinds that
    // do not double as the folder names beside them, and the run-on sentence broken
    // where it was already asking to be.
    '  This survey reads source only, so whatever else lives there — stylesheets,',
    '  images, build output — was never counted:',
    ...wrapList(sourceless.map((folder) => folder.folder), 74, '    '),
  ];
}

function importMatrixLines(result: SurveyResult): string[] {
  const rows = result.edges.map(
    (edge) => `  ${String(edge.count).padStart(4)}  ${edge.from} → ${edge.to}`,
  );

  return [
    '',
    'Import matrix (cross-folder, heaviest first — includes test files;',
    'inspect excludes the ones its globs reach, so its counts run lower):',
    ...rows,
    ...(rows.length ? [] : ['  — none —']),
  ];
}

/**
 * An unqualified count reads as a promise — the playbook once called it "exactly how
 * many errors the wiring will introduce" and a field agent proved it 5 ≠ 0 against
 * impact (test files are exempt as far as the globs reach, and textual matches include
 * mock specifiers / dynamic imports / doc comments). A zero prints as an explicit zero:
 * the playbook cites this section, so an absent row read as a gap two field agents had
 * to puzzle out (issues #25, #28).
 */
function selfAliasLines(result: SurveyResult): string[] {
  const entries = Object.entries(result.selfAliasImports);

  return [
    '',
    'Same-folder imports via the alias (textual upper bound incl. test',
    'files — `impact` reports what the wired rules will really flag):',
    ...(entries.length
      ? entries
          .sort((a, b) => b[1] - a[1])
          .map(([folder, count]) => `  ${String(count).padStart(4)}  ${folder}`)
      : ['     0  (none found)']),
  ];
}

function testConventionLines(result: SurveyResult): string[] {
  if (!result.testEvidence.length) {
    return [];
  }

  return [
    '',
    'Test conventions:',
    ...result.testEvidence.map(
      (entry) => `  ${String(entry.files).padStart(4)}  ${entry.pattern}`,
    ),
  ];
}

function packageUsageLines(result: SurveyResult): string[] {
  if (!result.packageUsage.length) {
    return [];
  }

  return [
    '',
    'Package usage (most concentrated first — ownership candidates):',
    ...result.packageUsage
      .slice(0, 15)
      .map((entry) => `  ${entry.package} — ${entry.folders.join(', ')}`),
    ...overflowNote(result.packageUsage.length),
  ];
}

function ownableImportLines(result: SurveyResult): string[] {
  if (!result.ownableImports.length) {
    return [];
  }

  return [
    '',
    'Named imports in ONE folder, from a package in several (specifier-level ownership',
    'candidates — `owns: [{ package, imports: […] }]`; the rows above cannot support '
    + 'one).',
    // The section's claim is stronger than the matrix's — it names ONE owner — so its
    // one blind spot belongs beside it. `scan` reads source text: it collects the names
    // in a brace clause and cannot see which members a namespace import touches, so
    // "hooks only" means "no other folder names it in braces".
    'Read from brace clauses only: a member reached through `import * as` is invisible',
    'here, so a folder using one is not counted against the "only":',
    ...result.ownableImports
      .slice(0, 15)
      .map((entry) => `  ${entry.package} → ${entry.name} — ${entry.folder} only`),
    ...overflowNote(result.ownableImports.length),
  ];
}

function unresolvedLines(result: SurveyResult): string[] {
  if (!result.unresolved.length) {
    return [];
  }

  return [
    '',
    'Unresolved alias-like imports (an undeclared alias? declare it in additionalAliases, '
    + 'or pass --alias):',
    ...result.unresolved.map(
      (entry) => `  ${String(entry.count).padStart(4)}  ${entry.prefix}/…`,
    ),
  ];
}

/** Both capped sections print the same line when the list runs past the cap. */
function overflowNote(total: number): string[] {
  return total > 15 ? [`  … ${total - 15} more (use --json for the full list)`] : [];
}
