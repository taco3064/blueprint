import fs from 'node:fs';
import path from 'node:path';

import type { RemovalFacts } from './facts';
import type { RemovalAction, RemovalConflict } from './types';

const CONFIG_NAME = /^(?:\.eslintrc(?:\.(?:c?js|json|ya?ml))?|[\w.-]+\.config\.[cm]?[jt]s)$/;
const BLUEPRINT_COMMAND = /(?:^|[\s;&|(])(?:npx\s+)?(?:@kekkai\/)?blueprint(?:\s|$)/;

export interface PlannedFiles {
  deleted: Set<string>;
  written: Map<string, string>;
}

export function plannedFiles(actions: readonly RemovalAction[]): PlannedFiles {
  return {
    deleted: new Set(actions.flatMap((action) => action.kind === 'delete' ? [action.path] : [])),
    written: new Map(actions.flatMap((action) =>
      action.kind === 'write' ? [[action.path, action.content] as const] : [])),
  };
}

export function remainingText(root: string, file: string, planned: PlannedFiles): string | null {
  if (planned.deleted.has(file)) {
    return null;
  }

  try {
    return planned.written.get(file) ?? fs.readFileSync(path.join(root, file), 'utf-8');
  } catch {
    return null;
  }
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
  const text = remainingText(root, file, planned);
  let scripts: Record<string, unknown> = {};

  try {
    scripts = (JSON.parse(text ?? '{}') as { scripts?: Record<string, unknown> }).scripts ?? {};
  } catch {
    return [];
  }

  return Object.entries(scripts)
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

  return fs.readdirSync(directory).filter((name) => CONFIG_NAME.test(name))
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
