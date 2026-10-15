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
  limitations: string[];
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

  const [literal] = normalized.split(/[*?]|\{[^}]*\}/, 1);

  return literal.split('/').slice(0, -1).join('/');
}

function excluded(file: string, sourceRoot: string): boolean {
  return file === sourceRoot || file.startsWith(`${sourceRoot}/`)
    || file.split('/').some((segment) => NON_SOURCE_DIRS.has(segment));
}

function readableDirectory(
  root: string, directory: string, limitations: string[],
): string | undefined {
  const absolute = path.resolve(root, directory);
  const relative = path.relative(root, canonicalPath(absolute));

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    limitations.push(`${directory}: directory resolves outside the application root`);

    return undefined;
  }

  const entry = fs.lstatSync(absolute, { throwIfNoEntry: false });

  if (entry?.isSymbolicLink()) {
    limitations.push(`${directory}: symbolic-link directory could not be inventoried`);

    return undefined;
  }

  return entry?.isDirectory() ? absolute : undefined;
}

function isDirectoryLink(root: string, file: string, entry: fs.Dirent): boolean {
  return entry.isSymbolicLink() && !SOURCE_EXT.test(file)
    && !fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile();
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

    const absolute = readableDirectory(root, directory, inventory.limitations);

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

        if (isDirectoryLink(root, file, entry)) {
          walk(file, reason);
        }
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

  const entries = result.stdout.split('\0');
  // Stryker disable next-line MethodExpression: empty paths name the rejected root directory.
  const visible = entries.filter(Boolean);

  for (const file of visible) {
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
    // Stryker disable next-line ArrayDeclaration: assigned from candidates before any read.
    files: [], directoryWalks: 0,
    limitations: [],
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
