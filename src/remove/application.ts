import fs from 'node:fs';
import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { scan } from '../inspect';
import { quotedIn, REQUIRED_DEPS, STACK_DEPS, VITE_FILES } from '../project';
import type { RemovalApplication, RemovalMode } from './facts';
import { parseManifest } from './documents';
import { provenRemoval } from './proven';
import { recordedRemoval } from './recorded';
import type { ApplicationRemoval, FileAction, RemovalResidue } from './types';

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

function aliasUsage(application: RemovalApplication): (file: string) => string | null {
  let used: string | null | undefined;

  const measure = (): string | null => {
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
  };

  return (file) => {
    if (!ALIAS_WIRING.test(path.posix.basename(file))) {
      return null;
    }

    used = used === undefined ? measure() : used;

    return used;
  };
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

type Unrecorded = Extract<RemovalResidue, { kind: 'unrecorded' }>;

function unrecordedResidues(application: RemovalApplication, prefix: string): Unrecorded[] {
  const aliases = application.blueprint === null ? [] : aliasesOf(application.blueprint);

  const aliasFiles = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json', ...VITE_FILES]
    .filter((file) => {
      const text = read(path.join(application.root, file));

      return text !== null
        && aliases.some((alias) => quotedIn(text, alias) || quotedIn(text, `${alias}/*`));
    });

  const manifest = parseManifest(read(path.join(application.root, 'package.json')));

  return [
    ...aliasFiles.map((file): Unrecorded => ({
      kind: 'unrecorded', path: path.posix.join(prefix, file), detail: 'alias',
    })),
    ...(/\beslint\b/.test(manifest.scripts?.lint ?? '')
      ? [{
          kind: 'unrecorded' as const,
          path: path.posix.join(prefix, 'package.json'),
          detail: 'lint-script' as const,
        }]
      : []),
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
  const prefix = application.key === '.' ? '' : application.key;

  const recorded = recordedRemoval({
    root: application.root,
    prefix,
    records: application.provenance,
    aliasInUse: aliasUsage(application),
  });

  const proven = provenRemoval({
    root: application.root,
    prefix,
    blueprint: application.blueprint,
    recordedIgnoreEdit: application.provenance.some((record) =>
      record.kind === 'edit' && record.path === '.gitignore'),
  });

  const actions = dedupe([...recorded.actions, ...proven.actions]);

  const deleted = new Set(actions.flatMap((action) =>
    action.kind === 'delete' ? [action.path] : []));

  const recordedPaths = new Set(application.provenance.flatMap((record) =>
    'path' in record ? [path.posix.join(prefix, record.path)] : []));

  return {
    actions,
    conflicts: [...recorded.conflicts, ...proven.conflicts],
    residues: [
      ...recorded.residues.filter((residue) => !('path' in residue) || !deleted.has(residue.path)),
      ...(mode === 'provenance'
        ? []
        : unrecordedResidues(application, prefix)
            .filter((residue) => !recordedPaths.has(residue.path))),
    ],
  };
}
