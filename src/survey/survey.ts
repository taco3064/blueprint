import fs from 'node:fs';
import path from 'node:path';

import { scan } from '../inspect/scan';
import { resolveSegments, stripAlias } from '../inspect/resolve';
import { detect, detectAliases } from '../project';
import type { PackageManager } from '../project';
import type { ScanResult } from '../inspect/types';

/**
 * `blueprint survey` — deterministic evidence for authoring a blueprint on a
 * brownfield repo. Runs *without* a config (it serves the moment before one
 * exists): folder candidates, the folder-to-folder import matrix, module-shape
 * evidence, test conventions, and package-usage concentration. It reports
 * facts and never judges — the judgment (intended layers, flow order,
 * ownership) belongs to whoever authors the config, human or agent.
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

/** Direct + scoped dependency names from package.json (prod and dev). */
function dependencyNames(root: string): string[] {
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
        } else if (/^[~@#]/.test(ref.specifier)) {
          const prefix = ref.specifier.split('/')[0];

          unresolvedCounts.set(prefix, (unresolvedCounts.get(prefix) ?? 0) + 1);
        }
      }
    }
  }

  const result: SurveyResult = {
    framework: state.framework,
    typescript: state.hasTypescript,
    packageManager: state.packageManager,
    aliases,
    rootFiles: scanResult.files
      .filter((file) => file.segments.length === 1)
      .map((file) => file.segments[0])
      .sort(),
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
      .map(([name, folders]) => ({ package: name, folders: [...folders].sort() }))
      .sort((a, b) => a.folders.length - b.folders.length || a.package.localeCompare(b.package)),
    unresolved: [...unresolvedCounts.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count),
    totalFiles: scanResult.files.length,
  };

  log(options.json ? JSON.stringify(result, null, 2) : renderSurvey(result));

  return result;
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
      `  ${folder.folder.padEnd(16)} ${String(folder.files).padStart(4)} files · ${folder.directFiles} direct · ${folder.childFolders} child folders (${folder.indexedChildren} with index) · depth ${folder.maxDepth}`,
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

  if (selfEntries.length) {
    lines.push('', 'Same-folder imports via the alias:');

    for (const [folder, count] of selfEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(count).padStart(4)}  ${folder}`);
    }
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
