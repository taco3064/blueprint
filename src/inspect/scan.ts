import fs from 'node:fs';
import path from 'node:path';

import { compareText } from './order';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue)$/;
// Clause excludes quotes so a side-effect/dynamic import is never swallowed.
const FROM_RE = /\b(import|export)\b([^;'"]*?)\bfrom\b\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * The imported name in one brace entry — `Foo`, `type Foo`, `Foo as F`. Read as
 * tokens, so every piece decides something: narrow the split and `type  Foo` reads
 * as no name at all, drop the modifier arm and it reads as `type`.
 */
function importedName(part: string): string {
  const [first, second] = part.trim().split(/\s+/);

  // `import { type }` is a member literally named `type`; only a modifier that
  // has something after it is a modifier.
  return first === 'type' ? second ?? first : first;
}

function extractNames(clause: string): string[] {
  const braced = clause.match(/\{([^}]*)\}/);

  if (!braced) {
    return [];
  }

  return braced[1].split(',').map(importedName).filter(Boolean);
}

/**
 * How the import graph was derived, in the words the reader of an output needs.
 *
 * This function's own doc comment has said "best-effort regex" since it was written,
 * and that honesty reached nobody: it is in the source, and `grep -rn best-effort`
 * over the docs, the README and every CLI surface found nothing. An adopting agent's
 * priors fill that gap with "tools resolve imports properly", so `✓ Architecture
 * Success` reads as a verdict on the dependency graph rather than on what a text scan
 * could see — and a clean result is exactly where the gap costs something.
 *
 * Prose rather than a measurement, deliberately. What a regex missed is not something
 * the tool can count; a boundary and a stance are what prose is for. But it is ONE
 * text with call sites, not a paragraph per surface — the same shape as
 * `printConfigCaveats`, and for the same reason: four paraphrases of the
 * `--print-config` caveats each drifted, and the shape was at fault rather than the
 * care taken.
 *
 * The correction at the end is the load-bearing half. Without it, "the graph is
 * approximate" reads as "the gates are approximate", which is false and is the more
 * expensive wrong belief of the two.
 */
export function importGraphDerivation(indent = ''): string {
  return [
    `${indent}How this graph was read: source text, not a parsed AST. A computed specifier`,
    `${indent}(\`import(path)\`, \`require(name)\` — anything but a quoted literal), the individual`,
    `${indent}names behind \`import * as\`, and import-like text inside a string are outside what`,
    `${indent}it can see — so read it as a survey, not as the last word on any one import. The`,
    `${indent}hard gates do not share the limit: they run in ESLint, on the AST, which is what`,
    `${indent}your CI enforces.`,
  ].join('\n');
}

/** Extract every import/export/require reference from a source file (best-effort regex). */
export function extractImports(source: string): ImportRef[] {
  const clean = stripComments(source);
  const refs: ImportRef[] = [];

  for (const [, kind, clause, specifier] of clean.matchAll(FROM_RE)) {
    refs.push({ specifier, names: extractNames(clause), isExport: kind === 'export' });
  }

  for (const [, specifier] of clean.matchAll(SIDE_EFFECT_RE)) {
    refs.push({ specifier, names: [], isExport: false });
  }

  for (const [, specifier] of clean.matchAll(DYNAMIC_RE)) {
    refs.push({ specifier, names: [], isExport: false });
  }

  return refs;
}

/**
 * Directories that never hold layer source. Skipped by the walk so a
 * `sourceRoot` of `.` (project root) does not descend into dependencies or
 * build output — harmless under a `src` root too, where they rarely appear.
 */
const NON_SOURCE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'coverage',
]);

/** The two things the walk asks of a directory entry. */
interface DirEntry {
  name: string;
  isDirectory: () => boolean;
}

export interface ScanOptions {
  /**
   * Directory reader (default `fs.readdirSync`). Injected because a real filesystem
   * cannot show the ordering guarantee below — the volumes a test runs on answer in
   * name order already, so only an out-of-order reader can ask whether the sort is
   * there.
   */
  readdir?: (dir: string) => DirEntry[];
}

/* v8 ignore next 3 -- the real reader; every caller in tests goes through it and
   the injected one is what the ordering tests use */
const realReaddir = (dir: string): DirEntry[] =>
  fs.readdirSync(dir, { withFileTypes: true });

/**
 * `readdirSync` answers in filesystem order, so an unsorted walk makes every
 * downstream list depend on which machine ran it — a determinism hole in a tool
 * emitting a contract two people diff. Sorted here once, so a consumer's own
 * `.sort()` is a guarantee rather than a late repair.
 */
function ordered(dir: string, readdir: (dir: string) => DirEntry[]): DirEntry[] {
  // The comparator is asked about its equal case in `compareText`'s own tests, which
  // is the only place that can: two entries in one directory cannot share a name.
  return readdir(dir).sort((a, b) => compareText(a.name, b.name));
}

/** The three facts that hold for the whole walk, so only `dir` and `files` move. */
interface WalkScope {
  /** Absolute source root the relative paths are measured from. */
  base: string;
  /** Display prefix put back on each path (the source root, unless it is '.'). */
  prefix: string;
  readdir: (dir: string) => DirEntry[];
}

function walk(dir: string, files: ScannedFile[], scope: WalkScope): void {
  const { base, prefix, readdir } = scope;

  for (const entry of ordered(dir, readdir)) {
    if (entry.isDirectory()) {
      if (NON_SOURCE_DIRS.has(entry.name)) {
        continue;
      }

      walk(path.join(dir, entry.name), files, scope);
    } else if (SOURCE_EXT.test(entry.name)) {
      // Paths are matched against forward-slash globs everywhere downstream
      // (globToRegExp nets, coverage, survival probes) — normalize at birth,
      // or every net silently matches nothing on Windows.
      const rel = path
        .relative(base, path.join(dir, entry.name))
        .split(path.sep)
        .join('/');

      files.push({
        path: prefix ? `${prefix}/${rel}` : rel,
        segments: rel.split('/'),
        imports: extractImports(fs.readFileSync(path.join(dir, entry.name), 'utf-8')),
      });
    }
  }
}

/**
 * Walk the source root (default `src/`, or `sourceRoot` when given — `.`
 * for a project-root layout) and return every source file with its imports.
 * `path` keeps the source-root prefix for display; `segments` are relative
 * to the root so `segments[0]` is always the layer.
 */
export function scan(root: string, sourceRoot = 'src', options: ScanOptions = {}): ScanResult {
  const readdir = options.readdir ?? realReaddir;
  // No special case for '.': `path.join(root, '.')` normalises to `root`, so the
  // branch that used to sit here could only ever produce the same base path.
  const base = path.join(root, sourceRoot);

  if (!fs.existsSync(base)) {
    return { topDirs: [], files: [] };
  }

  const topDirs = ordered(base, readdir)
    .filter((entry) => entry.isDirectory() && !NON_SOURCE_DIRS.has(entry.name))
    .map((entry) => entry.name);

  const files: ScannedFile[] = [];

  walk(base, files, { base, prefix: sourceRoot === '.' ? '' : sourceRoot, readdir });

  return { topDirs, files };
}

/** Characters that stop a glob segment from being read as one literal path segment. */
const GLOB_META = /[*?[\]{}]/;

/**
 * The leading segments of `segments` that are plain text, or null when they cannot be
 * placed against a root at all.
 *
 * Null on `..`: resolving it needs the root as a real path, and this only knows how the
 * root is spelled. `out/../src/**` reads as leaving a root of `src` when it lands inside
 * one, and a wrong reason here is a false statement rather than a missed one.
 */
function literalSegments(segments: string[]): string[] | null {
  const literal: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      return null;
    }

    if (GLOB_META.test(segment)) {
      break;
    }

    literal.push(segment);
  }

  return literal;
}

/**
 * The extension every path matching `glob` must end in, or null when the glob pins
 * none. Read off the last segment, and only when nothing after the dot can still
 * expand: `*.{ts,tsx}` and `*.{ts` both leave it open, and an open extension is not
 * something to classify on.
 */
function pinnedExtension(glob: string): string | null {
  const tail = glob.slice(glob.lastIndexOf('/') + 1);
  const dot = tail.lastIndexOf('.');
  const ext = tail.slice(dot);

  return dot > 0 && ext.length > 1 && !GLOB_META.test(ext) ? ext : null;
}

/**
 * One path spelling read as the segments it denotes.
 *
 * DERIVED ONCE AND USED ON BOTH SIDES of every positional comparison below — the glob and
 * `sourceRoot`, never one and not the other. Normalising one side is worse than
 * normalising neither: it compares a real segment against a phantom and reports a glob as
 * leaving a root it sits inside.
 *
 * It NORMALISES rather than enumerating. A segment that denotes no directory is dropped:
 * `.`, and the empties a leading, trailing or doubled separator leaves behind. `src`,
 * `./src`, `src/`, `./src/`, `//src` and `./src/./` are one path, and so is any spelling
 * built from the same two rules. Three fix rounds each normalised one spelling and each
 * produced the next instance at this site; the axis is what is normalised here, not a
 * list of the spellings that have been seen.
 *
 * It does NOT judge the glob. `..` is kept, so `literalSegments` can decline a prefix it
 * cannot place, and nothing here rejects, repairs or validates an entry.
 *
 * A root of `.` — or of `./`, or `.//.` — lands here as `[]`, which is what the walk does
 * with it too: it puts no prefix back on the paths it yields, so nothing is outside it.
 */
function canonicalSegments(spec: string): string[] {
  return spec.split('/').filter((segment) => segment !== '' && segment !== '.');
}

/**
 * The first segment of `segments` naming a directory this walk skips, or null.
 *
 * Offset by the root's own SEGMENT COUNT, never by whether the glob happens to spell the
 * root: a `sourceRoot` of `out/app` puts `out` at index 0, and testing it reports the
 * walk as never descending into a directory it is walking right now. The count holds
 * whatever the glob spells there, which a prefix match does not — and both sides are
 * canonical, or a `./` or a trailing `/` in the root shifts the offset off the root's
 * real end.
 *
 * Past a root of several segments the reach is short: a glob whose `dist` sits under a
 * leading `**` is handed back rather than stated. A lost detection, never a false
 * sentence, and the criterion permits either — so it is left rather than contorted.
 *
 * Never the last segment either: a name in final position is a file's, and a file is
 * decided by its extension.
 */
function skippedDirectory(segments: string[], rootSegments: string[]): string | null {
  return segments
    .slice(rootSegments.length, -1)
    .find((segment) => NON_SOURCE_DIRS.has(segment)) ?? null;
}

/**
 * Why no path this walk produces can match `glob`, or null when the glob text does not
 * settle it — the reason in the words a reader of an output needs, the shape
 * `unavailableGate` already uses for "a gate you cannot open is not a gate".
 *
 * Three limbs, and all three are facts this module owns: the root it is handed, the
 * directories it refuses to descend into, and the extensions it reads. A caller holding
 * `SOURCE_EXT` and `NON_SOURCE_DIRS` instead would re-derive membership beside the walk
 * that owns them, which is the second position on one question `unavailableGate` exists
 * to have merged.
 *
 * NO LIMB EVER TESTS A SEGMENT LYING INSIDE `sourceRoot`, and the first limb to fire
 * wins — so a limb firing wrongly hides the true one behind it. Both positional limbs
 * therefore read the same `canonicalSegments` normalisation, applied to the glob and to
 * the root, and both stand down where the alignment is not certain.
 *
 * THAT INVARIANT IS ASSERTED BY A TEST, NOT BY THIS PARAGRAPH — and a sentence here
 * standing in for one is the defect that outlived every spelling. It shipped three times,
 * each version true of the input that motivated it: "reads past the source root's own
 * segments" (only when the glob spelled the whole root), "`.` is dropped before either
 * runs" (only on the glob side), and a matrix over `.` spellings (which `src/` walked
 * straight through, its empty segment putting two `src/`-prefixed globs on opposite sides
 * of one root). `scan.test.ts` now varies the spelling AXIS mechanically rather than
 * listing spellings, and asserts equal roots before it asserts anything about limbs.
 *
 * Every shape it cannot settle answers null, deliberately. Callers use this to say a
 * dead glob is dead by where it points rather than by what the tree holds, and to
 * withhold a hand-back that would otherwise assert one of two things while a third is
 * true; a wrong reason is a fabrication where a null only hands the call back.
 */
export function outsideScanReach(glob: string, sourceRoot = 'src'): string | null {
  const root = { segments: canonicalSegments(sourceRoot), spelled: sourceRoot };
  const segments = canonicalSegments(glob);
  const literal = literalSegments(segments);
  const positional = literal === null ? null : placedReason(segments, literal, root);

  if (positional !== null) {
    return positional;
  }

  const ext = pinnedExtension(glob);

  return ext !== null && !SOURCE_EXT.test(ext)
    ? `a file type this scan does not read (\`${ext}\`)`
    : null;
}

/**
 * The two limbs that turn on where the glob sits, once its segments can be placed.
 *
 * `spelled` rides along beside the normalised segments because the two are for different
 * readers: the comparison needs `./src` and `src` to be one path, and the adopter needs
 * to read back the string their own config holds.
 */
function placedReason(
  segments: string[],
  literal: string[],
  root: { segments: string[]; spelled: string },
): string | null {
  const leavesRoot = root.segments.some(
    (segment, index) => index < literal.length && literal[index] !== segment,
  );

  if (leavesRoot) {
    return `outside the source root \`${root.spelled}\``;
  }

  const skipped = skippedDirectory(segments, root.segments);

  return skipped === null ? null : `a directory this scan never descends into (\`${skipped}\`)`;
}
