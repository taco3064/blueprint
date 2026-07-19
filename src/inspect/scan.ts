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

function walk(dir: string, base: string, files: ScannedFile[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, base, files);
    } else if (SOURCE_EXT.test(entry.name)) {
      const rel = path.relative(base, full);

      files.push({
        path: path.join('src', rel),
        segments: rel.split(path.sep),
        imports: extractImports(fs.readFileSync(full, 'utf-8')),
      });
    }
  }
}

/** Walk `src/` and return every source file with its extracted imports. */
export function scan(root: string): ScanResult {
  const srcDir = path.join(root, 'src');

  if (!fs.existsSync(srcDir)) {
    return { topDirs: [], files: [] };
  }

  const topDirs = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const files: ScannedFile[] = [];

  walk(srcDir, srcDir, files);

  return { topDirs, files };
}
