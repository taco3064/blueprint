import fs from 'node:fs';
import path from 'node:path';

import { parseManifest } from './documents';
import type { RemovalFacts } from './facts';
import type { FileAction, RemovalConflict } from './types';

export const TOOL_CONFIG = /^(?:\.eslintrc(?:\.(?:c?js|json|ya?ml))?|[\w.-]+\.config\.[cm]?[jt]s)$/;

const BLUEPRINT_COMMAND = /(?:^|[\s;&|(])blueprint(?:\s|$)/;

export type PlannedFiles = ReadonlyMap<string, string | null>;

export function plannedFiles(actions: readonly FileAction[]): PlannedFiles {
  return new Map(actions.map((action) =>
    [action.path, action.kind === 'write' ? action.content : null]));
}

export function readText(file: string): string | null {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile()
    ? fs.readFileSync(file, 'utf-8')
    : null;
}

export function remainingText(root: string, file: string, planned: PlannedFiles): string | null {
  return planned.has(file) ? planned.get(file)! : readText(path.join(root, file));
}

export function relativeDirectory(root: string, directory: string): string {
  return path.relative(root, directory).split(path.sep).join('/');
}

function scriptConflicts(
  root: string,
  directory: string,
  planned: PlannedFiles,
): RemovalConflict[] {
  const file = path.posix.join(relativeDirectory(root, directory), 'package.json');
  const manifest = parseManifest(remainingText(root, file, planned));

  return Object.entries<unknown>(manifest.scripts ?? {})
    .filter(([, command]) => typeof command === 'string'
      && (BLUEPRINT_COMMAND.test(command) || command.includes('@kekkai/blueprint')))
    .map(([name]) => ({ kind: 'reference', path: file, detail: 'script', name }));
}

function importConflicts(
  context: { root: string; directory: string; planned: PlannedFiles },
  owned: boolean,
  configs: string[],
): RemovalConflict[] {
  const { root, directory, planned } = context;
  const prefix = relativeDirectory(root, directory);

  return fs.readdirSync(directory).filter((name) => TOOL_CONFIG.test(name))
    .flatMap((name): RemovalConflict[] => {
      const file = path.posix.join(prefix, name);
      const text = remainingText(root, file, planned);

      if (text === null) {
        return [];
      }

      if (owned && text.includes('@kekkai/blueprint')) {
        return [{ kind: 'reference', path: file, detail: 'import' }];
      }

      return configs.some((config) => text.includes(config))
        ? [{ kind: 'reference', path: file, detail: 'config-path' }]
        : [];
    });
}

export function referenceConflicts(facts: RemovalFacts, planned: PlannedFiles): RemovalConflict[] {
  const full = facts.remaining.length === 0;
  const applicationRoots = facts.scope.map((application) => application.root);

  const directories = [...new Set([
    ...applicationRoots,
    facts.root,
    ...facts.scope.flatMap((application) =>
      application.manifest ? [application.manifest.root] : []),
  ])];

  return directories.flatMap((directory) => {
    const owned = full || applicationRoots.includes(directory);

    const configs = facts.scope.map((application) => applicationRoots.includes(directory)
      ? 'blueprint.config.mjs'
      : path.posix.join(relativeDirectory(directory, application.root), 'blueprint.config.mjs'));

    return [
      ...(owned ? scriptConflicts(facts.root, directory, planned) : []),
      ...importConflicts({ root: facts.root, directory, planned }, owned, configs),
    ];
  });
}
