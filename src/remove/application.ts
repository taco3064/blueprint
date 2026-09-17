import fs from 'node:fs';
import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { scan } from '../inspect';
import { listSourceDirs, quotedIn, REQUIRED_DEPS, STACK_DEPS, VITE_FILES } from '../project';
import type { RemovalApplication, RemovalMode } from './facts';
import { parseManifest } from './documents';
import { provenRemoval } from './proven';
import { recordedRemoval } from './recorded';
import { readText } from './references';
import type { ApplicationRemoval, FileAction, RemovalResidue } from './types';

const ALIAS_FILES = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json', ...VITE_FILES];

const ALIAS_WIRING = /^(?:tsconfig(?:\.[\w-]+)?\.json|jsconfig\.json|vite\.config\.[cm]?[jt]s)$/;

export const CARRIER_DEPENDENCIES = [
  ...REQUIRED_DEPS.filter((name) => name !== '@kekkai/blueprint'),
  ...Object.values(STACK_DEPS),
];

function aliasesOf(blueprint: Blueprint): string[] {
  return [
    blueprint.architecture.alias,
    ...Object.keys(blueprint.architecture.additionalAliases ?? {}),
  ];
}

function usedAlias(application: RemovalApplication): string | null {
  const { blueprint } = application;

  if (blueprint === null) {
    return 'the configured alias';
  }

  const specifiers = scan(
    application.root,
    resolveArchitecture(blueprint.architecture).sourceRoot,
  ).files.flatMap((file) => file.imports.map((entry) => entry.specifier));

  return aliasesOf(blueprint).find((alias) => specifiers.some((specifier) =>
    specifier === alias || specifier.startsWith(`${alias}/`))) ?? null;
}

export function isAliasWiring(file: string): boolean {
  return ALIAS_WIRING.test(path.posix.basename(file));
}

type Unrecorded = Extract<RemovalResidue, { kind: 'unrecorded' | 'unrecorded-folder' }>;

function emptyLayerFolders(application: RemovalApplication, prefix: string): Unrecorded[] {
  const sourceRoot = application.blueprint === null
    ? 'src'
    : resolveArchitecture(application.blueprint.architecture).sourceRoot;

  return listSourceDirs(application.root, sourceRoot)
    .map((name) => path.posix.join(sourceRoot, name))
    .filter((folder) => fs.readdirSync(path.join(application.root, folder)).join() === '.gitkeep')
    .map((folder) => ({ kind: 'unrecorded-folder', path: path.posix.join(prefix, folder) }));
}

function aliasFiles(blueprint: Blueprint, root: string): string[] {
  const aliases = aliasesOf(blueprint);

  return ALIAS_FILES.filter((file) => {
    const text = readText(path.join(root, file)) ?? '';

    return aliases.some((alias) => quotedIn(text, alias) || quotedIn(text, `${alias}/*`));
  });
}

function unrecordedResidues(application: RemovalApplication, prefix: string): Unrecorded[] {
  const { blueprint, root } = application;
  const manifest = parseManifest(readText(path.join(root, 'package.json')));
  const files = blueprint === null ? [] : aliasFiles(blueprint, root);

  return [
    ...files.map((file): Unrecorded => ({
      kind: 'unrecorded', path: path.posix.join(prefix, file), detail: 'alias',
    })),
    ...(/\beslint\b/.test(manifest.scripts?.lint ?? '')
      ? [{
          kind: 'unrecorded' as const,
          path: path.posix.join(prefix, 'package.json'),
          detail: 'lint-script' as const,
        }]
      : []),
    ...emptyLayerFolders(application, prefix),
  ];
}

function dedupe(actions: FileAction[]): FileAction[] {
  const seen = new Set<string>();

  return actions.filter((action) => {
    if (seen.has(action.path)) {
      return false;
    }

    seen.add(action.path);

    return true;
  });
}

export function applicationRemoval(
  application: RemovalApplication,
  mode: RemovalMode,
): ApplicationRemoval {
  const prefix = application.key;
  const alias = usedAlias(application);

  const recorded = recordedRemoval({
    root: application.root,
    prefix,
    records: application.provenance,
    aliasInUse: (file) => isAliasWiring(file) ? alias : null,
  });

  const proven = provenRemoval({
    root: application.root,
    prefix,
    blueprint: application.blueprint,
    recordedIgnoreEdit: application.provenance.some((record) =>
      record.kind === 'edit' && record.path === '.gitignore'),
  });

  const actions = dedupe([...recorded.actions, ...proven.actions]);

  const deleted = new Set(actions.filter((action) => action.kind === 'delete')
    .map((action) => action.path));

  const recordedPaths = new Set(application.provenance
    .filter((record) => 'path' in record)
    .map((record) => path.posix.join(prefix, (record as { path: string }).path)));

  return {
    actions,
    conflicts: [...recorded.conflicts, ...proven.conflicts],
    residues: [
      ...recorded.residues.filter((residue) => !deleted.has(residue.path)),
      ...(mode === 'provenance'
        ? []
        : unrecordedResidues(application, prefix)
            .filter((residue) => !recordedPaths.has(residue.path))),
    ],
  };
}
