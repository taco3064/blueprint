import fs from 'node:fs';
import path from 'node:path';

import { aliasRoot } from '../config';
import type { AliasRoot } from '../config';
import { resolveSegments, scan, stripAlias } from '../inspect';
import type { ImportRef, ScannedFile, ScanResult } from '../inspect';
import { detect, detectAliases, surveyScope, toolchainForSource } from '../project';
import type { PackageManager } from '../project';
import { renderSurvey } from './render';
import { measureRepeatedFolderShapes } from './shapes';

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

/** Repeated direct-child folder evidence among sibling folder instances. */
export interface RepeatedFolderShape {
  /** Directory containing the sibling instances. */
  parent: string;
  /** Siblings connected by at least one repeated direct-child folder. */
  instances: string[];
  repeatedChildren: {
    folder: string;
    presentIn: number;
    instanceCount: number;
  }[];
}

export interface SurveyResult {
  framework: string | null;
  typescript: boolean;
  packageManager: PackageManager;
  /** Directory scanned for source evidence. */
  sourceRoot?: string;
  /** Scope boundary or inference the adopter must account for. */
  scopeNote?: string;
  /** Multiple application roots were found, so authoring needs an explicit scope. */
  scopeRequired?: boolean;
  /** Detected (or overridden) import aliases that target `src/`. */
  aliases: Record<string, string>;
  /** Source files directly under `src/` (entry wiring, not layer code). */
  rootFiles: string[];
  folders: FolderEvidence[];
  /** Measured repetition among sibling folders; evidence, not an architecture classification. */
  repeatedFolderShapes?: RepeatedFolderShape[];
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
  const scope = surveyScope(root, options.sourceRoot);
  const sourceRoot = scope.sourceRoot;
  const scanResult = scan(root, sourceRoot);

  const aliases = options.alias
    ? { [options.alias]: sourceRoot }
    : detectAliases(toolchainForSource(root, sourceRoot).tsconfigs);

  const structuralAliases = Object.entries(aliases)
    .map(([alias, target]) => aliasRoot(alias, target, sourceRoot))
    .filter((entry): entry is AliasRoot => entry !== null);

  const tally = tallyImports(scanResult, {
    aliases: structuralAliases,
    aliasNames: Object.keys(aliases),
    folderSet: new Set(scanResult.topDirs),
    deps: dependencyNames(root).sort((a, b) => b.length - a.length),
  });

  const result = surveyResult(state, scanResult, { aliases, tally, scope });

  log(options.json ? JSON.stringify(result, null, 2) : renderSurvey(result));

  return result;
}

interface ImportTally {

  edgeCounts: Map<string, number>;
  selfAliasImports: Record<string, number>;
  packageFolders: Map<string, Set<string>>;
  specifierFolders: Map<string, { package: string; name: string; folders: Set<string> }>;
  unresolvedCounts: Map<string, number>;
}

interface SurveyEvidence {
  aliases: Record<string, string>;
  tally: ImportTally;
  scope: ReturnType<typeof surveyScope>;
}

interface RefScope {
  file: ScannedFile;
  from: string;
  aliases: AliasRoot[];
  aliasNames: string[];
  folderSet: Set<string>;

  deps: string[];
}

function tallyImports(
  scanResult: ScanResult,
  scope: { aliases: AliasRoot[]; aliasNames: string[]; folderSet: Set<string>; deps: string[] },
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

function bucket(segment: string, folderSet: Set<string>): string {
  return folderSet.has(segment) ? segment : ROOT_BUCKET;
}

function tallyRef(ref: ImportRef, at: RefScope, tally: ImportTally): void {
  const parts = stripAlias(ref.specifier, at.aliases);

  if (parts) {
    tallyAliasRef(bucket(parts[0], at.folderSet), at.from, tally);

    return;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(at.file.segments.slice(0, -1), ref.specifier);

    if (target !== null) {
      addEdge(bucket(target[0], at.folderSet), at.from, tally);
    }

    return;
  }

  if (at.aliasNames.some((alias) => ref.specifier === alias || ref.specifier.startsWith(`${alias}/`))) {
    return;
  }

  tallyPackageRef(ref, at, tally);
}

function tallyAliasRef(to: string, from: string, tally: ImportTally): void {
  if (to === from && from !== ROOT_BUCKET) {
    tally.selfAliasImports[from] = (tally.selfAliasImports[from] ?? 0) + 1;

    return;
  }

  addEdge(to, from, tally);
}

function addEdge(to: string, from: string, tally: ImportTally): void {
  if (to === from) {
    return;
  }

  const key = `${from} → ${to}`;

  tally.edgeCounts.set(key, (tally.edgeCounts.get(key) ?? 0) + 1);
}

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

  for (const name of ref.names) {
    const key = JSON.stringify([dep, name]);

    const entry = tally.specifierFolders.get(key)
      ?? { package: dep, name, folders: new Set<string>() };

    entry.folders.add(at.from);
    tally.specifierFolders.set(key, entry);
  }
}

function surveyResult(
  state: ReturnType<typeof detect>,
  scanResult: ScanResult,
  evidence: SurveyEvidence,
): SurveyResult {
  const { aliases, tally, scope } = evidence;

  const spread = new Set(
    [...tally.packageFolders].filter(([, folders]) => folders.size > 1).map(([name]) => name),
  );

  return {
    framework: state.framework,
    typescript: state.hasTypescript,
    packageManager: state.packageManager,
    sourceRoot: scope.sourceRoot,
    ...(scope.note ? { scopeNote: scope.note } : {}),
    ...(scope.required ? { scopeRequired: true } : {}),
    aliases,

    rootFiles: scanResult.files
      .filter((file) => file.segments.length === 1)
      .map((file) => file.segments[0]),
    folders: folderEvidence(scanResult),
    repeatedFolderShapes: measureRepeatedFolderShapes(scanResult, scope.sourceRoot),
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

        && !entry.folders.has(ROOT_BUCKET))
      .map((entry) => ({ package: entry.package, name: entry.name, folder: [...entry.folders][0] }))
      .sort((a, b) => a.package.localeCompare(b.package) || a.name.localeCompare(b.name)),
    unresolved: [...tally.unresolvedCounts.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count),
    totalFiles: scanResult.files.length,
  };
}
