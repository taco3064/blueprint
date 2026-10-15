import fs from 'node:fs';
import path from 'node:path';

import { canonicalPath } from '../project';

import { importedPath } from './scope';
import type { ScannedFile } from './types';

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue'];

export function unresolvedProjectReferences(
  root: string,
  files: ScannedFile[],
  aliases: [string, string][],
): string[] {
  return files.flatMap((file) => [...new Set(modulePaths(file, aliases))]
    .filter((target) => !referenceExists(root, target))
    .map((target) => `${file.path}: unresolved project reference ${target}`));
}

function modulePaths(file: ScannedFile, aliases: [string, string][]): string[] {
  if (file.moduleSpecifiers === undefined) {
    return [];
  }

  return file.moduleSpecifiers
    .map((specifier) => importedPath(specifier, file.path, aliases)).filter(Boolean);
}

export function referenceExists(root: string, target: string): boolean {
  if (target === '..' || target.startsWith('../') || path.posix.isAbsolute(target)) {
    return false;
  }

  const clean = target.split(/[?#]/)[0];
  const stem = clean.replace(/\.jsx?$/, '');

  const candidates = [clean,
    ...EXTENSIONS.flatMap((extension) => [`${stem}${extension}`, `${clean}/index${extension}`])];

  return candidates.some((candidate) => {
    const absolute = path.join(root, candidate);

    const relative = path.relative(canonicalPath(root), canonicalPath(absolute));

    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return false;
    }

    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  });
}
