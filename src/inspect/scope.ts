import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { renderFindingMessage } from '../operational-contract';
import type { Finding, ScanResult } from './types';

export function applicationScopeFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
): Finding[] {
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first') {
    return [];
  }

  const reached = reachedDirectories(scan, resolved.aliasMappings, new Set(scan.outsideDirs));

  return reached.length === 0
    ? []
    : [{
        severity: 'error',
        rule: 'uncovered-application-source',
        path: resolved.sourceRoot,
        subject: reached.join(' '),
        message: renderFindingMessage({
          kind: 'uncovered-application-source',
          sourceRoot: resolved.sourceRoot,
          directories: reached,
        }),
      }];
}

function reachedDirectories(
  scan: ScanResult,
  aliases: [string, string][],
  outside: Set<string>,
): string[] {
  const reached = scan.files.flatMap((file) => file.imports.flatMap((ref) =>
    importedDirectories(ref.specifier, file.path, aliases)
      .filter((directory) => outside.has(directory))));

  return [...new Set(reached)].sort();
}

function importedDirectories(
  specifier: string,
  from: string,
  aliases: [string, string][],
): string[] {
  const alias = aliases.find(([name]) =>
    specifier === name || specifier.startsWith(`${name}/`));

  if (alias) {
    return [firstSegment(path.posix.join(alias[1], specifier.slice(alias[0].length)))];
  }

  return specifier.startsWith('.')
    ? [firstSegment(path.posix.join(path.posix.dirname(from), specifier))]
    : [];
}

function firstSegment(target: string): string {
  return path.posix.normalize(target).split('/')[0];
}
