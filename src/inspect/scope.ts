import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef, ResolvedArchitecture } from '../config';
import { renderFindingMessage, renderOutsideScopeError } from '../operational-contract';
import type { Finding, ScanResult, ScannedFile } from './types';

export function applicationScopeFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  resolved = resolveArchitecture(architecture),
): Finding[] {
  if (resolved.topology !== 'module-first' || resolved.sourceRoot === '.') {
    return [];
  }

  if (!scan.outsideScope || scan.outsideScope.status === 'not-requested') {
    throw new Error(renderOutsideScopeError('not-requested'));
  }

  const coupled = coupledDirectories(scan, resolved);
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
  { aliasMappings: aliases, sourceRoot, consumerFiles }: ResolvedArchitecture,
): { imported: string[]; importing: string[] } {
  const root = sourceRoot.split('/');

  const files = scan.outsideScope && 'files' in scan.outsideScope ? scan.outsideScope.files : [];

  const outsideFiles = files
    .map((file) => ({ file, directory: fileDirectory(file.segments, root) }))
    .filter((entry) => entry.directory !== '');

  const outside = new Set(outsideFiles.map((entry) => entry.directory));

  const imported = scan.files.flatMap((file) => importedPaths(file, aliases)
    .map((target) => outsideDirectory(target.split('/'), root))
    .filter((directory) => outside.has(directory)));

  const importing = outsideFiles
    .filter((entry) => !consumerFiles.matches(entry.file.path))
    .flatMap((entry) =>
      importedPaths(entry.file, aliases).some((target) => isUnder(target, sourceRoot))
        ? [entry.directory]
        : []);

  return { imported: unique(imported), importing: unique(importing) };
}

export function outsideDirectory(segments: string[], sourceRoot: string[]): string {
  const depth = sourceRoot.findIndex((segment, index) => segments[index] !== segment);

  return segments.slice(0, depth + 1).join('/');
}

function fileDirectory(segments: string[], sourceRoot: string[]): string {
  const directory = outsideDirectory(segments, sourceRoot);

  return directory.split('/').length < segments.length ? directory : '';
}

function isUnder(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}/`);
}

function unique(directories: string[]): string[] {
  return [...new Set(directories)].sort();
}

export function importedPaths(file: ScannedFile, aliases: [string, string][]): string[] {
  if (file.moduleSpecifiers === undefined) {
    return [];
  }

  return file.moduleSpecifiers.map((specifier) => importedPath(specifier, file.path, aliases));
}

export function importedPath(
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
