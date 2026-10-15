import fs from 'node:fs';
import path from 'node:path';

import { importedPath } from './scope';
import type { ScannedFile } from './types';

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue'];

export function unresolvedProjectReferences(
  root: string,
  files: ScannedFile[],
  aliases: [string, string][],
): string[] {
  return files.flatMap((file) => [...new Set((file.moduleSpecifiers ?? [])
    .map((specifier) => importedPath(specifier, file.path, aliases)).filter(Boolean))]
    .filter((target) => !referenceExists(root, target))
    .map((target) => `${file.path}: unresolved project reference ${target}`));
}

function referenceExists(root: string, target: string): boolean {
  if (target === '..' || target.startsWith('../') || path.posix.isAbsolute(target)) {
    return false;
  }

  const clean = target.split(/[?#]/)[0];
  const stem = clean.replace(/\.jsx?$/, '');

  const candidates = [clean,
    ...EXTENSIONS.flatMap((extension) => [`${stem}${extension}`, `${clean}/index${extension}`])];

  return candidates.some((candidate) => {
    const absolute = path.join(root, candidate);

    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  });
}
