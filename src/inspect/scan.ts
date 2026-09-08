import fs from 'node:fs';
import path from 'node:path';

import { compareText } from './order';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue)$/;

const FROM_RE = /\b(import|export)\b([^;'"]*?)\bfrom\b\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function importedName(part: string): string {
  const [first, second] = part.trim().split(/\s+/);

  return first === 'type' ? second ?? first : first;
}

function extractNames(clause: string): string[] {
  const braced = clause.match(/\{([^}]*)\}/);

  if (!braced) {
    return [];
  }

  return braced[1].split(',').map(importedName).filter(Boolean);
}

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

interface DirEntry {
  name: string;
  isDirectory: () => boolean;
}

export interface ScanOptions {

  readdir?: (dir: string) => DirEntry[];
}

/* v8 ignore next 3 -- the real reader; every caller in tests goes through it and
   the injected one is what the ordering tests use */
const realReaddir = (dir: string): DirEntry[] =>
  fs.readdirSync(dir, { withFileTypes: true });

function ordered(dir: string, readdir: (dir: string) => DirEntry[]): DirEntry[] {
  return readdir(dir).sort((a, b) => compareText(a.name, b.name));
}

interface WalkScope {

  base: string;

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

export function scan(root: string, sourceRoot = 'src', options: ScanOptions = {}): ScanResult {
  const readdir = options.readdir ?? realReaddir;

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

const GLOB_META = /[*?[\]{}]/;

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

function pinnedExtension(glob: string): string | null {
  const tail = glob.slice(glob.lastIndexOf('/') + 1);
  const dot = tail.lastIndexOf('.');
  const ext = tail.slice(dot);

  return dot > 0 && ext.length > 1 && !GLOB_META.test(ext) ? ext : null;
}

function canonicalSegments(spec: string): string[] {
  return spec.split('/').filter((segment) => segment !== '' && segment !== '.');
}

function skippedDirectory(segments: string[], rootSegments: string[]): string | null {
  return segments
    .slice(rootSegments.length, -1)
    .find((segment) => NON_SOURCE_DIRS.has(segment)) ?? null;
}

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
