import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { renderFindingMessage } from '../operational-contract';
import type { Finding, ScanResult, ScannedFile } from './types';

export function applicationScopeFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
): Finding[] {
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first') {
    return [];
  }

  const coupled = coupledDirectories(scan, resolved.aliasMappings, resolved.sourceRoot);
  const named = [...new Set([...coupled.imported, ...coupled.importing])].sort();

  return named.length === 0
    ? []
    : [{
        severity: 'error',
        rule: 'uncovered-application-source',
        path: resolved.sourceRoot,
        subject: named.join(' '),
        message: renderFindingMessage({
          kind: 'uncovered-application-source',
          sourceRoot: resolved.sourceRoot,
          imported: coupled.imported,
          importing: coupled.importing,
        }),
      }];
}

function coupledDirectories(
  scan: ScanResult,
  aliases: [string, string][],
  sourceRoot: string,
): { imported: string[]; importing: string[] } {
  const outsideFiles = scan.outsideFiles ?? [];
  const outside = new Set(outsideFiles.map((file) => file.segments[0]));

  const imported = scan.files.flatMap((file) => importedPaths(file, aliases)
    .map((target) => target.split('/')[0])
    .filter((directory) => outside.has(directory)));

  const importing = outsideFiles.flatMap((file) =>
    importedPaths(file, aliases).some((target) => isUnder(target, sourceRoot))
      ? [file.segments[0]]
      : []);

  return { imported: unique(imported), importing: unique(importing) };
}

function isUnder(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}/`);
}

function unique(directories: string[]): string[] {
  return [...new Set(directories)].sort();
}

function importedPaths(file: ScannedFile, aliases: [string, string][]): string[] {
  return file.imports.map((ref) => importedPath(ref.specifier, file.path, aliases));
}

function importedPath(
  specifier: string,
  from: string,
  aliases: [string, string][],
): string {
  const alias = aliases.find(([name]) =>
    specifier === name || specifier.startsWith(`${name}/`));

  if (alias) {
    return path.posix.join(alias[1], specifier.slice(alias[0].length));
  }

  return specifier.startsWith('.')
    ? path.posix.join(path.posix.dirname(from), specifier)
    : '';
}
