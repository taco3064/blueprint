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

function extractNames(clause: string): string[] {
  const braced = clause.match(/\{([^}]*)\}/);

  if (!braced) return [];

  return braced[1]
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
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

function walk(dir: string, base: string, prefix: string, files: ScannedFile[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (NON_SOURCE_DIRS.has(entry.name)) continue;

      walk(path.join(dir, entry.name), base, prefix, files);
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
export function scan(root: string, sourceRoot = 'src'): ScanResult {
  const base = sourceRoot === '.' ? root : path.join(root, sourceRoot);

  if (!fs.existsSync(base)) {
    return { topDirs: [], files: [] };
  }

  const topDirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NON_SOURCE_DIRS.has(entry.name))
    .map((entry) => entry.name);

  const files: ScannedFile[] = [];

  walk(base, base, sourceRoot === '.' ? '' : sourceRoot, files);

  return { topDirs, files };
}
