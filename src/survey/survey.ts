import fs from 'node:fs';
import path from 'node:path';

import { scan } from '../inspect/scan';
import { resolveSegments, stripAlias } from '../inspect/resolve';
import { detect, detectAliases } from '../project';
import type { PackageManager } from '../project';
import type { ScanResult } from '../inspect/types';

/**
 * `blueprint survey` — deterministic evidence for authoring a blueprint on a
 * brownfield repo, run WITHOUT a config because it serves the moment before one
 * exists. It reports facts and never judges: the judgment belongs to whoever
 * authors the config.
 */

/** Imports that resolve to a file directly under `src/` (no folder). */
export const ROOT_BUCKET = '(src root)';

export interface SurveyOptions {
  /** Import alias override when tsconfig detection finds none, e.g. `@`. */
  alias?: string;
  /** Directory layers live under (default `src`; `.` for a root layout). */
  sourceRoot?: string;
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** Module-shape evidence for one top-level folder under `src/`. */
export interface FolderEvidence {
  folder: string;
  /** Source files anywhere under the folder. */
  files: number;
  /** Files sitting directly in the folder (depth 1). */
  directFiles: number;
  /** Distinct direct child folders. */
  childFolders: number;
  /** Child folders exposing a direct `index.*` — folder-module evidence. */
  indexedChildren: number;
  /** Deepest nesting below the folder. */
  maxDepth: number;
}

/** One cross-folder dependency edge observed in the source. */
export interface SurveyEdge {
  from: string;
  to: string;
  count: number;
}

export interface SurveyResult {
  framework: string | null;
  typescript: boolean;
  packageManager: PackageManager;
  /** Detected (or overridden) import aliases that target `src/`. */
  aliases: Record<string, string>;
  /** Source files directly under `src/` (entry wiring, not layer code). */
  rootFiles: string[];
  folders: FolderEvidence[];
  /** Cross-folder edges, heaviest first. */
  edges: SurveyEdge[];
  /** Same-folder imports going through the alias, per folder. */
  selfAliasImports: Record<string, number>;
  /** Test-convention evidence: pattern → matching file count. */
  testEvidence: { pattern: string; files: number }[];
  /** Package → folders importing it, most-concentrated first. */
  packageUsage: { package: string; folders: string[] }[];
  /**
   * Named imports appearing in exactly one folder, from a package that appears in
   * several — the only evidence a specifier-level `owns` clause can rest on. The
   * matrix above is package-granular, so it cannot verify one (field run #148).
   *
   * Only the concentrated ones, and only where the package is not: a specifier in
   * three folders supports nothing, and a package already in one folder is covered
   * by the package-level row.
   */
  ownableImports: { package: string; name: string; folder: string }[];
  /**
   * Alias-looking specifier prefixes (`~x/…`, `@x/…`, `#x/…`) that matched no
   * detected alias and no dependency — usually an undeclared alias (declare it
   * in `additionalAliases`, or pass `--alias`), sometimes a missing dep.
   */
  unresolved: { prefix: string; count: number }[];
  totalFiles: number;
}

const TEST_PATTERNS: { pattern: string; test: (filePath: string) => boolean }[] = [
  { pattern: '**/*.test.*', test: (p) => /\.test\.[^/]+$/.test(p) },
  { pattern: '**/*.spec.*', test: (p) => /\.spec\.[^/]+$/.test(p) },
  { pattern: '**/__tests__/**', test: (p) => /\/__tests__\//.test(p) },
  { pattern: 'src/test/**', test: (p) => p.startsWith('src/test/') || p.startsWith('src/tests/') },
];

/**
 * Direct + scoped dependency names from package.json (prod and dev).
 *
 * Exported for its own test. The failure arm answers `[]`, and through `runSurvey`
 * that is indistinguishable from answering a list of names nobody imports — the
 * list exists to be matched against import specifiers, and a wrong name matches
 * nothing. Asked directly, "no readable package.json is no dependencies" is one
 * value to compare.
 */
export function dependencyNames(root: string): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  } catch {
    return [];
  }
}

type FolderTally = FolderEvidence & { indexed: Set<string>; children: Set<string> };

function folderEvidence(scanResult: ScanResult): FolderEvidence[] {
  const byFolder = new Map<string, FolderTally>();

  for (const dir of scanResult.topDirs) {
    byFolder.set(dir, {
      folder: dir,
      files: 0,
      directFiles: 0,
      childFolders: 0,
      indexedChildren: 0,
      maxDepth: 0,
      indexed: new Set(),
      children: new Set(),
    });
  }

  for (const file of scanResult.files) {
    const evidence = byFolder.get(file.segments[0]);

    if (!evidence) continue;

    evidence.files += 1;
    evidence.maxDepth = Math.max(evidence.maxDepth, file.segments.length - 1);

    if (file.segments.length === 2) {
      evidence.directFiles += 1;
    } else {
      evidence.children.add(file.segments[1]);

      if (file.segments.length === 3 && /^index\.[^.]+$/.test(file.segments[2])) {
        evidence.indexed.add(file.segments[1]);
      }
    }
  }

  return [...byFolder.values()]
    .map(({ indexed, children, ...evidence }) => ({
      ...evidence,
      childFolders: children.size,
      indexedChildren: indexed.size,
    }))
    .sort((a, b) => b.files - a.files);
}

/**
 * Run `blueprint survey` in `root`. Read-only; always succeeds.
 * @group Runtimes
 * @example
 * const survey = runSurvey(process.cwd()); // folders, import matrix, package usage
 */
export function runSurvey(root: string, options: SurveyOptions = {}): SurveyResult {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const scanResult = scan(root, options.sourceRoot);

  const aliases = options.alias
    ? { [options.alias]: 'src' }
    : detectAliases(state.tsconfigs);

  const aliasNames = Object.keys(aliases);
  const deps = dependencyNames(root).sort((a, b) => b.length - a.length);
  const folderSet = new Set(scanResult.topDirs);

  const edgeCounts = new Map<string, number>();
  const selfAliasImports: Record<string, number> = {};
  const packageFolders = new Map<string, Set<string>>();

  const specifierFolders
    = new Map<string, { package: string; name: string; folders: Set<string> }>();

  const unresolvedCounts = new Map<string, number>();

  for (const file of scanResult.files) {
    const from = folderSet.has(file.segments[0]) ? file.segments[0] : ROOT_BUCKET;

    for (const ref of file.imports) {
      const parts = stripAlias(ref.specifier, aliasNames);

      if (parts) {
        const to = folderSet.has(parts[0]) ? parts[0] : ROOT_BUCKET;

        if (to === from && from !== ROOT_BUCKET) {
          selfAliasImports[from] = (selfAliasImports[from] ?? 0) + 1;
        } else if (to !== from) {
          const key = `${from} → ${to}`;

          edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        }
      } else if (ref.specifier.startsWith('.')) {
        const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

        if (target === null) continue; // climbs out of src/ — inspect's business later.

        const to = folderSet.has(target[0]) ? target[0] : ROOT_BUCKET;

        if (to !== from) {
          const key = `${from} → ${to}`;

          edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        }
      } else {
        const dep = deps.find(
          (name) => ref.specifier === name || ref.specifier.startsWith(`${name}/`),
        );

        if (dep) {
          packageFolders.set(dep, (packageFolders.get(dep) ?? new Set()).add(from));

          // Keyed on the pair AND carrying it, rather than joined and split back
          // apart: the separator is the only thing a rejoined key can get wrong, and
          // it did — one invisible character in place of the space, and every row
          // failed the package lookup, with the empty list reading exactly like
          // "this repo has nothing ownable at specifier granularity".
          for (const name of ref.names) {
            const key = JSON.stringify([dep, name]);

            const entry = specifierFolders.get(key)
              ?? { package: dep, name, folders: new Set<string>() };

            entry.folders.add(from);
            specifierFolders.set(key, entry);
          }
        } else if (/^[~@#]/.test(ref.specifier)) {
          const prefix = ref.specifier.split('/')[0];

          unresolvedCounts.set(prefix, (unresolvedCounts.get(prefix) ?? 0) + 1);
        }
      }
    }
  }

  // The packages more than one folder imports — the only ones whose specifiers can
  // say anything the package row does not. A `Set.has` rather than reading the size
  // back out of `packageFolders`: every specifier was recorded in the same branch
  // that recorded its package, so the absent arm of that lookup is unreachable, and
  // a defensive `?? 0` there is a branch no test can ever reach.
  const spread = new Set(
    [...packageFolders].filter(([, folders]) => folders.size > 1).map(([name]) => name),
  );

  const result: SurveyResult = {
    framework: state.framework,
    typescript: state.hasTypescript,
    packageManager: state.packageManager,
    aliases,
    // `scan` walks in name order, so these arrive sorted — the `.sort()` that used
    // to close each of these two lines was repairing an order that is now settled
    // upstream, and could not be measured while it did.
    rootFiles: scanResult.files
      .filter((file) => file.segments.length === 1)
      .map((file) => file.segments[0]),
    folders: folderEvidence(scanResult),
    edges: [...edgeCounts.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split(' → ');

        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count),
    selfAliasImports,
    testEvidence: TEST_PATTERNS.map(({ pattern, test }) => ({
      pattern,
      files: scanResult.files.filter((file) => test(file.path)).length,
    })).filter((entry) => entry.files > 0),
    packageUsage: [...packageFolders.entries()]
      .map(([name, folders]) => ({ package: name, folders: [...folders] }))
      .sort((a, b) => a.folders.length - b.folders.length || a.package.localeCompare(b.package)),
    ownableImports: [...specifierFolders.values()]
      .filter((entry) => entry.folders.size === 1
        && spread.has(entry.package)
        // `(src root)` is not a layer — this survey says so twenty lines above ("root
        // files (wiring, not layers)") — so a specifier concentrated there is evidence
        // for a clause `owns` cannot express. The section calls its rows ownership
        // candidates; a row no config can name is not one.
        && !entry.folders.has(ROOT_BUCKET))
      .map((entry) => ({ package: entry.package, name: entry.name, folder: [...entry.folders][0] }))
      .sort((a, b) => a.package.localeCompare(b.package) || a.name.localeCompare(b.name)),
    unresolved: [...unresolvedCounts.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count),
    totalFiles: scanResult.files.length,
  };

  log(options.json ? JSON.stringify(result, null, 2) : renderSurvey(result));

  return result;
}

/**
 * Wrap a comma-joined list to `width`, at the given indent. The survey hand-wraps every
 * other line it prints; a list whose length is the reader's repo cannot be hand-wrapped.
 */
function wrapList(items: string[], width: number, indent: string): string[] {
  const lines: string[] = [];

  for (const item of items) {
    const last = lines.length - 1;
    const candidate = lines.length ? `${lines[last]} ${item},` : `${indent}${item},`;

    if (lines.length && candidate.length <= width) lines[last] = candidate;
    else lines.push(`${indent}${item},`);
  }

  return lines.map((line, index) => (index === lines.length - 1 ? line.replace(/,$/, '') : line));
}

/** The human-readable survey report. */
export function renderSurvey(result: SurveyResult): string {
  const lines: string[] = [
    `Survey · ${result.framework ?? 'unknown framework'}${result.typescript ? ' + typescript' : ''} · ${result.packageManager} · ${result.totalFiles} source files`,
    '',
  ];

  const aliasEntries = Object.entries(result.aliases);

  lines.push(
    aliasEntries.length
      ? `Alias: ${aliasEntries.map(([alias, dir]) => `${alias} → ${dir}`).join(', ')}`
      : 'Alias: none detected in tsconfig paths — pass --alias <name> if the project has one.',
    '',
  );

  if (result.rootFiles.length) {
    lines.push(`src/ root files (wiring, not layers): ${result.rootFiles.join(', ')}`, '');
  }

  lines.push('Folders (module-shape evidence):');

  for (const folder of result.folders) {
    lines.push(
      `  ${folder.folder.padEnd(16)} ${String(folder.files).padStart(4)} source files · ${folder.directFiles} direct · ${folder.childFolders} child folders (${folder.indexedChildren} with index) · depth ${folder.maxDepth}`,
    );
  }

  // Every row said "N files", and a row exists BECAUSE its folder does — so `0` read as
  // an empty folder, which is the one thing it cannot mean. An adopter took
  // `styles 0 files` for empty, ran `ls`, and found a directory of `.css` (field run
  // #150). Once, under the block, not per row: the same reason the row itself does not
  // repeat it — N copies of one sentence bury the numbers they sit beside.
  const sourceless = result.folders.filter((folder) => folder.files === 0);

  if (sourceless.length) {
    // A blank line and no `  name` opening, because both were there: the note ran at the
    // rows' own indent with no gap, and its first line began with the folder list — so
    // `assets, styles: 0 source files means the` read as a fourth row for a folder called
    // "assets, styles". Every other section here opens on a blank line for the same
    // reason. The list wraps at 74 too: `public/ assets/ locales/ generated/` is one
    // ordinary project, and it was the only line in this output nothing bounded.
    lines.push(
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
    );
  }

  // A bare heading over nothing reads as a render failure — say "none"
  // (field issue #6). Same below for the import matrix.
  if (!result.folders.length) lines.push('  — none —');

  lines.push(
    '',
    'Import matrix (cross-folder, heaviest first — includes test files;',
    'inspect excludes them, so its counts run lower):',
  );

  for (const edge of result.edges) {
    lines.push(`  ${String(edge.count).padStart(4)}  ${edge.from} → ${edge.to}`);
  }

  if (!result.edges.length) lines.push('  — none —');

  const selfEntries = Object.entries(result.selfAliasImports);

  // An unqualified count reads as a promise — the playbook once called it
  // "exactly how many errors the wiring will introduce" and a field agent
  // proved it 5 ≠ 0 against impact (test files are exempt, and textual
  // matches include mock specifiers / dynamic imports / doc comments).
  // A zero prints as an explicit zero: the playbook cites this section, so
  // an absent row read as a gap two field agents had to puzzle out
  // (issues #25, #28).
  lines.push(
    '',
    'Same-folder imports via the alias (textual upper bound incl. test',
    'files — `impact` reports what the wired rules will really flag):',
  );

  if (selfEntries.length) {
    for (const [folder, count] of selfEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(count).padStart(4)}  ${folder}`);
    }
  } else {
    lines.push('     0  (none found)');
  }

  if (result.testEvidence.length) {
    lines.push('', 'Test conventions:');

    for (const entry of result.testEvidence) {
      lines.push(`  ${String(entry.files).padStart(4)}  ${entry.pattern}`);
    }
  }

  if (result.packageUsage.length) {
    lines.push('', 'Package usage (most concentrated first — ownership candidates):');

    for (const entry of result.packageUsage.slice(0, 15)) {
      lines.push(`  ${entry.package} — ${entry.folders.join(', ')}`);
    }

    if (result.packageUsage.length > 15) {
      lines.push(`  … ${result.packageUsage.length - 15} more (use --json for the full list)`);
    }
  }

  if (result.ownableImports.length) {
    lines.push(
      '',
      'Named imports in ONE folder, from a package in several (specifier-level ownership',
      'candidates — `owns: [{ package, imports: […] }]`; the rows above cannot support one).',
      // The section's claim is stronger than the matrix's — it names ONE owner — so its
      // one blind spot belongs beside it. `scan` reads source text: it collects the names
      // in a brace clause and cannot see which members a namespace import touches, so
      // "hooks only" means "no other folder names it in braces".
      'Read from brace clauses only: a member reached through `import * as` is invisible',
      'here, so a folder using one is not counted against the "only":',
    );

    for (const entry of result.ownableImports.slice(0, 15)) {
      lines.push(`  ${entry.package} → ${entry.name} — ${entry.folder} only`);
    }

    if (result.ownableImports.length > 15) {
      lines.push(`  … ${result.ownableImports.length - 15} more (use --json for the full list)`);
    }
  }

  if (result.unresolved.length) {
    lines.push(
      '',
      'Unresolved alias-like imports (an undeclared alias? declare it in additionalAliases, or pass --alias):',
    );

    for (const entry of result.unresolved) {
      lines.push(`  ${String(entry.count).padStart(4)}  ${entry.prefix}/…`);
    }
  }

  return lines.join('\n');
}
