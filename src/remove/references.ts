import fs from 'node:fs';
import path from 'node:path';

import { emitLint } from '../emit/lint';
import { scan } from '../inspect';
import { PACKAGE_NAME } from '../lifecycle';
import { analyzeModuleImports } from '../plugin';
import { withoutComments } from './comments';
import { parseManifest } from './documents';
import type { RemovalFacts } from './facts';
import type { EmittedRuleInventory, FileAction, RemovalConflict } from './types';

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

export function emittedRuleInventory(facts: RemovalFacts): EmittedRuleInventory | undefined {
  const ids = new Set<string>();

  facts.scope.forEach((application) => {
    if (application.blueprint === null) {
      return;
    }

    emitLint(application.blueprint).forEach((entry) => {
      Object.keys(entry.rules ?? {}).forEach((id) => ids.add(id));
    });
  });

  return ids.size === 0
    ? undefined
    : {
        total: ids.size,
        exclusive: [...ids].filter((id) => id.startsWith('blueprint/')).length,
      };
}

function importConflicts(
  context: {
    root: string;
    directory: string;
    planned: PlannedFiles;
    rules: EmittedRuleInventory | undefined;
  },
  owned: boolean,
  configs: string[],
): RemovalConflict[] {
  const { root, directory, planned } = context;
  const prefix = relativeDirectory(root, directory);

  return fs.readdirSync(directory).filter((name) => TOOL_CONFIG.test(name))
    .flatMap((name): RemovalConflict[] => {
      const file = path.posix.join(prefix, name);
      const remaining = remainingText(root, file, planned);

      if (remaining === null) {
        return [];
      }

      const text = withoutComments(file, remaining);

      if (owned && importsBlueprint(remaining, file, true)) {
        return [{ kind: 'reference', path: file, detail: 'import', rules: context.rules }];
      }

      return configs.some((config) => text.includes(config))
        ? [{ kind: 'reference', path: file, detail: 'config-path' }]
        : [];
    });
}

function importsBlueprint(source: string, file: string, configFallback = false): boolean {
  if (configFallback && !/\.[cm]?[jt]s$/.test(file)) {
    return withoutComments(file, source).includes(PACKAGE_NAME);
  }

  const analysis = analyzeModuleImports(source, file);

  if (analysis.parseError && configFallback) {
    return withoutComments(file, source).includes(PACKAGE_NAME);
  }

  return analysis.specifiers.some((specifier) =>
    specifier === PACKAGE_NAME || specifier.startsWith(`${PACKAGE_NAME}/`));
}

function sourceImportConflicts(
  facts: RemovalFacts,
  planned: PlannedFiles,
  rules: EmittedRuleInventory | undefined,
): RemovalConflict[] {
  const seen = new Set<string>();

  return facts.scope.flatMap((application) => scan(application.root, '.').files
    .flatMap((source): RemovalConflict[] => {
      const file = path.posix.join(relativeDirectory(facts.root, application.root), source.path);

      if (seen.has(file) || TOOL_CONFIG.test(path.posix.basename(file))) {
        return [];
      }

      seen.add(file);
      const remaining = remainingText(facts.root, file, planned);

      return remaining !== null && importsBlueprint(remaining, file)
        ? [{ kind: 'reference', path: file, detail: 'import', rules }]
        : [];
    }));
}

function workflowConflicts(root: string, planned: PlannedFiles): RemovalConflict[] {
  const directory = path.join(root, '.github', 'workflows');

  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => path.posix.join('.github/workflows', entry.name));

  return files.flatMap((file): RemovalConflict[] => {
    const content = remainingText(root, file, planned);

    if (content === null) {
      return [];
    }

    const executable = withoutComments(file, content).split('\n')
      .filter((line) => /^\s*(?:-\s*)?run\s*:/.test(line))
      .join('\n');

    return BLUEPRINT_COMMAND.test(executable) || executable.includes('@kekkai/blueprint')
      ? [{ kind: 'reference', path: file, detail: 'script', name: 'workflow' }]
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

  const rules = emittedRuleInventory(facts);

  return [
    ...(full ? workflowConflicts(facts.root, planned) : []),
    ...sourceImportConflicts(facts, planned, rules),
    ...directories.flatMap((directory) => {
      const owned = full || applicationRoots.includes(directory);

      const configs = facts.scope.map((application) => applicationRoots.includes(directory)
        ? 'blueprint.config.mjs'
        : path.posix.join(relativeDirectory(directory, application.root), 'blueprint.config.mjs'));

      return [
        ...(owned ? scriptConflicts(facts.root, directory, planned) : []),
        ...importConflicts({ root: facts.root, directory, planned, rules }, owned, configs),
      ];
    }),
  ];
}
