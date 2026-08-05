import fs from 'node:fs';
import path from 'node:path';

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
 * The imported name in one brace entry — `Foo`, `type Foo`, `Foo as F`.
 *
 * Read as tokens rather than as a chain of string surgery. The old form
 * (trim → strip a leading `type` → split on ` as ` → trim again) had two
 * operations that could not be wrong: its final `.trim()` never fired, because a
 * split's first half ends on a non-space by construction — and while it sat there
 * it silently repaired a `type  Foo` whose `\s+` had been narrowed to `\s`, so the
 * bug was cleaned up by an operation whose stated job was something else. Here
 * every piece decides something: narrow the split and `type  Foo` reads as no name
 * at all; drop the modifier arm and it reads as `type`.
 */
function importedName(part: string): string {
  const [first, second] = part.trim().split(/\s+/);

  // `import { type }` is a member literally named `type`; only a modifier that
  // has something after it is a modifier.
  return first === 'type' ? second ?? first : first;
}

function extractNames(clause: string): string[] {
  const braced = clause.match(/\{([^}]*)\}/);

  if (!braced) return [];

  return braced[1].split(',').map(importedName).filter(Boolean);
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
   * Directory reader (default `fs.readdirSync`). Injected because the ordering
   * guarantee below cannot be seen against a real filesystem: macOS answers in
   * name order already, and so does a small ext4 directory, so the sort that makes
   * the walk deterministic on every other volume reads as dead code exactly where
   * it is easiest to run. A reader that answers out of order is the only way to
   * ask whether the sort is there.
   */
  readdir?: (dir: string) => DirEntry[];
}

/* v8 ignore next 3 -- the real reader; every caller in tests goes through it and
   the injected one is what the ordering tests use */
const realReaddir = (dir: string): DirEntry[] =>
  fs.readdirSync(dir, { withFileTypes: true });

/**
 * `readdirSync` answers in filesystem order — creation order on some volumes,
 * name-hash order on others — so an unsorted walk makes every downstream list's
 * order depend on which machine ran it. That is a determinism hole in a tool whose
 * whole job is emitting a contract two people can diff, and it is why several
 * consumers grew a `.sort()` of their own: sorting late papers over an order that
 * was undefined early. Sorted here once, those become guarantees the reader can
 * rely on rather than repairs.
 */
function ordered(dir: string, readdir: (dir: string) => DirEntry[]): DirEntry[] {
  // `<` and `<=` decide the same order here, and that is a filesystem invariant
  // rather than an accident: two entries in one directory cannot share a name, so
  // the comparator is never asked about equality. Disprove it by finding a
  // directory that lists one name twice.
  return readdir(dir).sort((a, b) => (a.name < b.name ? -1 : 1));
}

function walk(
  dir: string,
  base: string,
  prefix: string,
  files: ScannedFile[],
  readdir: (dir: string) => DirEntry[],
): void {
  for (const entry of ordered(dir, readdir)) {
    if (entry.isDirectory()) {
      if (NON_SOURCE_DIRS.has(entry.name)) continue;

      walk(path.join(dir, entry.name), base, prefix, files, readdir);
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

  walk(base, base, sourceRoot === '.' ? '' : sourceRoot, files, readdir);

  return { topDirs, files };
}
