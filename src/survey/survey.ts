import fs from 'node:fs';
import path from 'node:path';

import { scan } from '../inspect/scan';
import { resolveSegments, stripAlias } from '../inspect/resolve';
import { detect, detectAliases } from '../project';
import type { PackageManager } from '../project';
import type { ImportRef, ScannedFile, ScanResult } from '../inspect/types';
import { renderSurvey } from './render';

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
  /** Child folders exposing a direct `index.*` — folder-layout evidence. */
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

    if (!evidence) {
      continue;
    }

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

  const tally = tallyImports(scanResult, {
    aliasNames: Object.keys(aliases),
    folderSet: new Set(scanResult.topDirs),
    deps: dependencyNames(root).sort((a, b) => b.length - a.length),
  });

  const result = surveyResult(state, scanResult, { aliases, tally });

  log(options.json ? JSON.stringify(result, null, 2) : renderSurvey(result));

  return result;
}

/** Everything one walk of the imports accumulates, keyed by the folder that imports. */
interface ImportTally {
  /** `"from → to"` → how many cross-folder imports carry it. */
  edgeCounts: Map<string, number>;
  selfAliasImports: Record<string, number>;
  packageFolders: Map<string, Set<string>>;
  specifierFolders: Map<string, { package: string; name: string; folders: Set<string> }>;
  unresolvedCounts: Map<string, number>;
}

/** What each reference is judged against, plus the folder it is judged FROM. */
interface RefScope {
  file: ScannedFile;
  from: string;
  aliasNames: string[];
  folderSet: Set<string>;
  /** Dependency names, longest first, so `a/b` wins over `a`. */
  deps: string[];
}

/** One pass over every import in the tree. */
function tallyImports(
  scanResult: ScanResult,
  scope: { aliasNames: string[]; folderSet: Set<string>; deps: string[] },
): ImportTally {
  const tally: ImportTally = {
    edgeCounts: new Map(),
    selfAliasImports: {},
    packageFolders: new Map(),
    specifierFolders: new Map(),
    unresolvedCounts: new Map(),
  };

  for (const file of scanResult.files) {
    const from = bucket(file.segments[0], scope.folderSet);

    for (const ref of file.imports) {
      tallyRef(ref, { ...scope, file, from }, tally);
    }
  }

  return tally;
}

/** A file directly under the source root has no folder — it lands in the root bucket. */
function bucket(segment: string, folderSet: Set<string>): string {
  return folderSet.has(segment) ? segment : ROOT_BUCKET;
}

/** One reference: an alias path, a relative path, or a package. */
function tallyRef(ref: ImportRef, at: RefScope, tally: ImportTally): void {
  const parts = stripAlias(ref.specifier, at.aliasNames);

  if (parts) {
    tallyAliasRef(bucket(parts[0], at.folderSet), at.from, tally);

    return;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(at.file.segments.slice(0, -1), ref.specifier);

    // climbs out of src/ — inspect's business later.
    if (target !== null) {
      addEdge(bucket(target[0], at.folderSet), at.from, tally);
    }

    return;
  }

  tallyPackageRef(ref, at, tally);
}

/** Reaching the importer's own folder through the alias is what the section counts. */
function tallyAliasRef(to: string, from: string, tally: ImportTally): void {
  if (to === from && from !== ROOT_BUCKET) {
    tally.selfAliasImports[from] = (tally.selfAliasImports[from] ?? 0) + 1;

    return;
  }

  addEdge(to, from, tally);
}

/** The matrix is cross-folder by definition, so a self-edge is not one of its rows. */
function addEdge(to: string, from: string, tally: ImportTally): void {
  if (to === from) {
    return;
  }

  const key = `${from} → ${to}`;

  tally.edgeCounts.set(key, (tally.edgeCounts.get(key) ?? 0) + 1);
}

/** A bare specifier: a known dependency, or an alias-shaped prefix nothing declares. */
function tallyPackageRef(ref: ImportRef, at: RefScope, tally: ImportTally): void {
  const dep = at.deps.find(
    (name) => ref.specifier === name || ref.specifier.startsWith(`${name}/`),
  );

  if (!dep) {
    if (/^[~@#]/.test(ref.specifier)) {
      const prefix = ref.specifier.split('/')[0];

      tally.unresolvedCounts.set(prefix, (tally.unresolvedCounts.get(prefix) ?? 0) + 1);
    }

    return;
  }

  tally.packageFolders.set(dep, (tally.packageFolders.get(dep) ?? new Set()).add(at.from));

  // Keyed on the pair AND carrying it, rather than joined and split back
  // apart: the separator is the only thing a rejoined key can get wrong, and
  // it did — one invisible character in place of the space, and every row
  // failed the package lookup, with the empty list reading exactly like
  // "this repo has nothing ownable at specifier granularity".
  for (const name of ref.names) {
    const key = JSON.stringify([dep, name]);

    const entry = tally.specifierFolders.get(key)
      ?? { package: dep, name, folders: new Set<string>() };

    entry.folders.add(at.from);
    tally.specifierFolders.set(key, entry);
  }
}

/** The report shape, assembled from the walk. */
function surveyResult(
  state: ReturnType<typeof detect>,
  scanResult: ScanResult,
  evidence: { aliases: Record<string, string>; tally: ImportTally },
): SurveyResult {
  const { aliases, tally } = evidence;

  // The packages more than one folder imports — the only ones whose specifiers can
  // say anything the package row does not. A `Set.has` rather than reading the size
  // back out of `packageFolders`: every specifier was recorded in the same branch
  // that recorded its package, so the absent arm of that lookup is unreachable, and
  // a defensive `?? 0` there is a branch no test can ever reach.
  const spread = new Set(
    [...tally.packageFolders].filter(([, folders]) => folders.size > 1).map(([name]) => name),
  );

  return {
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
    edges: [...tally.edgeCounts.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split(' → ');

        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count),
    selfAliasImports: tally.selfAliasImports,
    testEvidence: TEST_PATTERNS.map(({ pattern, test }) => ({
      pattern,
      files: scanResult.files.filter((file) => test(file.path)).length,
    })).filter((entry) => entry.files > 0),
    packageUsage: [...tally.packageFolders.entries()]
      .map(([name, folders]) => ({ package: name, folders: [...folders] }))
      .sort((a, b) => a.folders.length - b.folders.length || a.package.localeCompare(b.package)),
    ownableImports: [...tally.specifierFolders.values()]
      .filter((entry) => entry.folders.size === 1
        && spread.has(entry.package)
        // `(src root)` is not a layer — this survey says so twenty lines above ("root
        // files (wiring, not layers)") — so a specifier concentrated there is evidence
        // for a clause `owns` cannot express. The section calls its rows ownership
        // candidates; a row no config can name is not one.
        && !entry.folders.has(ROOT_BUCKET))
      .map((entry) => ({ package: entry.package, name: entry.name, folder: [...entry.folders][0] }))
      .sort((a, b) => a.package.localeCompare(b.package) || a.name.localeCompare(b.name)),
    unresolved: [...tally.unresolvedCounts.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count),
    totalFiles: scanResult.files.length,
  };
}
