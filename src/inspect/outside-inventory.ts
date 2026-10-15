import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedArchitecture } from '../config';
import { renderOutsideScopeError } from '../operational-contract';
import { canonicalPath, defaultGitReader, resolveRepositoryContext } from '../project';
import type { GitReader } from '../project';
import { NON_SOURCE_DIRS, SOURCE_EXT } from './scan';
import { importedPaths, outsideDirectory } from './scope';
import type { ScanResult } from './types';

export interface OutsideInventory {
  mode: 'git-visible' | 'filesystem-fallback';
  files: string[];
  directoryWalks: number;
  contributions: OutsideContributions;
  fallbackReason?: string;
}

export interface OutsideContributions {
  repositoryVisible: number;
  explicitConsumerRoot: number;
  governedReference: number;
}

type Contribution = keyof OutsideContributions;

export function consumerSearchRoot(glob: string): string {
  const normalized = glob.split(/[\\/]/)
    .filter((segment) => segment !== '' && segment !== '.').join('/');

  const index = normalized.search(/[*?]|\{[^}]*\}/);
  const literal = index === -1 ? normalized : normalized.slice(0, index);

  return literal.split('/').slice(0, -1).join('/');
}

function excluded(file: string, sourceRoot: string): boolean {
  return file === sourceRoot || file.startsWith(`${sourceRoot}/`)
    || file.split('/').some((segment) => NON_SOURCE_DIRS.has(segment));
}

function readableDirectory(root: string, directory: string): string | undefined {
  const absolute = path.resolve(root, directory);
  const relative = path.relative(root, absolute);

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !fs.existsSync(absolute) || !fs.lstatSync(absolute).isDirectory()) {
    return undefined;
  }

  return absolute;
}

function inventoryCollector(root: string, sourceRoot: string, inventory: OutsideInventory) {
  const candidates = new Set<string>();
  const visited = new Set<string>();

  const add = (file: string, reason: Contribution): void => {
    if (SOURCE_EXT.test(file) && !excluded(file, sourceRoot) && !candidates.has(file)) {
      candidates.add(file);
      inventory.contributions[reason]++;
    }
  };

  const walk = (directory: string, reason: Contribution): void => {
    if (visited.has(directory) || excluded(directory, sourceRoot)) {
      return;
    }

    const absolute = readableDirectory(root, directory);

    if (!absolute) {
      return;
    }

    visited.add(directory);
    inventory.directoryWalks++;

    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const file = directory ? `${directory}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(file, reason);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        add(file, reason);
      }
    }
  };

  return { add, walk, candidates };
}

function collectGitFiles(root: string, git: GitReader, add: (file: string) => void): void {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'];
  const result = git(args, root);

  if (result.status !== 0 || result.error) {
    throw new Error(renderOutsideScopeError('inventory'));
  }

  for (const file of result.stdout.split('\0').filter(Boolean)) {
    const entry = fs.lstatSync(path.join(root, file), { throwIfNoEntry: false });

    if (entry?.isFile() || entry?.isSymbolicLink()) {
      add(file);
    }
  }
}

function expandRoots(
  resolved: ResolvedArchitecture,
  scan: ScanResult,
  walk: (directory: string, reason: Contribution) => void,
): void {
  const explicit = resolved.consumerFiles.globs.map(consumerSearchRoot);

  const references = scan.files.flatMap((file) => importedPaths(file, resolved.aliasMappings))
    .map((target) => outsideDirectory(target.split('/'), resolved.sourceRoot.split('/')))
    .filter(Boolean);

  for (const directory of [...new Set(explicit)].sort()) {
    walk(directory, 'explicitConsumerRoot');
  }

  for (const directory of [...new Set(references)].sort()) {
    walk(directory, 'governedReference');
  }
}

export function outsideInventory(
  applicationRoot: string,
  resolved: ResolvedArchitecture,
  { scan, git = defaultGitReader }: { scan: ScanResult; git?: GitReader },
): OutsideInventory {
  const root = canonicalPath(applicationRoot);
  const repository = resolveRepositoryContext(root, git);

  const inventory: OutsideInventory = {
    mode: repository.ok ? 'git-visible' : 'filesystem-fallback',
    files: [], directoryWalks: 0,
    contributions: { repositoryVisible: 0, explicitConsumerRoot: 0, governedReference: 0 },
  };

  const collector = inventoryCollector(root, resolved.sourceRoot, inventory);

  if (repository.ok) {
    collectGitFiles(root, git, (file) => collector.add(file, 'repositoryVisible'));
    expandRoots(resolved, scan, collector.walk);
  } else {
    inventory.fallbackReason = 'Git repository visibility is unavailable.';
    collector.walk('', 'repositoryVisible');
  }

  inventory.files = [...collector.candidates].sort();

  return inventory;
}
