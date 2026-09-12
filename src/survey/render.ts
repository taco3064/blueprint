import type { SurveyResult } from './survey';
import { renderTestFilesEditorial } from '../editorial';

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

export function renderSurvey(result: SurveyResult): string {
  return [
    ...headerLines(result),
    ...folderLines(result),
    ...repeatedFolderShapeLines(result),
    ...importMatrixLines(result),
    ...selfAliasLines(result),
    ...testConventionLines(result),
    ...packageUsageLines(result),
    ...ownableImportLines(result),
    ...unresolvedLines(result),
  ].join('\n');
}

function repeatedFolderShapeLines(result: SurveyResult): string[] {
  const shapes = result.repeatedFolderShapes ?? [];

  if (!shapes.length) {
    return [];
  }

  return [
    '',
    'Repeated sibling-folder evidence (measured repetition only — not an architecture',
    'classification, recommendation, dependency rule, or enforcement claim):',
    ...shapes.flatMap((shape) => [
      `  ${shape.parent} — sibling instances: ${shape.instances.join(', ')}`,
      ...shape.repeatedChildren.map(
        (child) => `    ${child.folder} — ${child.presentIn}/${child.instanceCount} instances`,
      ),
    ]),
  ];
}

function headerLines(result: SurveyResult): string[] {
  const aliasEntries = Object.entries(result.aliases);
  const sourceRoot = result.sourceRoot ?? 'src';
  const rootLabel = sourceRoot === '.' ? 'Project' : `${sourceRoot}/`;

  return [
    `Survey · ${result.framework ?? 'unknown framework'}${result.typescript ? ' + typescript' : ''} · ${result.packageManager} · ${result.totalFiles} source files`,
    `Source root: ${sourceRoot}${result.scopeNote ? ` — ${result.scopeNote}` : ''}`,
    '',
    aliasEntries.length
      ? `Alias: ${aliasEntries.map(([alias, dir]) => `${alias} → ${dir}`).join(', ')}`
      : 'Alias: none detected in tsconfig paths — pass --alias <name> if the project has one.',
    '',
    ...(result.rootFiles.length
      ? [`${rootLabel} root files (wiring, not layers): ${result.rootFiles.join(', ')}`, '']
      : []),
  ];
}

function folderLines(result: SurveyResult): string[] {
  const rows = result.folders.map(
    (folder) =>
      `  ${folder.folder.padEnd(16)} ${String(folder.files).padStart(4)} source files · ${folder.directFiles} direct · ${folder.childFolders} child folders (${folder.indexedChildren} with index) · depth ${folder.maxDepth}`,
  );

  return [
    'Folders (folder-shape evidence):',
    ...rows,
    ...sourcelessNote(result),
    ...(rows.length ? [] : ['  — none —']),
  ];
}

function sourcelessNote(result: SurveyResult): string[] {
  const sourceless = result.folders.filter((folder) => folder.files === 0);

  if (!sourceless.length) {
    return [];
  }

  return [
    '',
    '  0 source files means the folder is HERE and holds none — not that it is empty.',

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
    'Import matrix (cross-folder, heaviest first):',
    renderTestFilesEditorial('survey', 'en'),
    ...rows,
    ...(rows.length ? [] : ['  — none —']),
  ];
}

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

function overflowNote(total: number): string[] {
  return total > 15 ? [`  … ${total - 15} more (use --json for the full list)`] : [];
}
