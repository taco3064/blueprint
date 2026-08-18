import fs from 'node:fs';
import path from 'node:path';

import { sourcePrefix } from '../config';
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
  /** Display prefix put back on each path — see {@link sourcePrefix}. */
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
      // (the layer nets, coverage, survival probes) — normalize at birth,
      // or every net silently matches nothing on Windows.
      const rel = path
        .relative(base, path.join(dir, entry.name))
        .split(path.sep)
        .join('/');

      files.push({
        path: `${prefix}${rel}`,
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

  walk(base, files, { base, prefix: sourcePrefix(sourceRoot), readdir });

  return { topDirs, files };
}
