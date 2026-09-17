import fs from 'node:fs';
import path from 'node:path';

import type { Blueprint } from '../config';
import { normalizeAgentEmit } from '../config';
import { defaultAgentPaths } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { BASELINE_FILE } from '../inspect';
import {
  AUTHORING_FILE,
  COMMAND_FILE,
  CONFIG_FILE,
  ESLINT_FILES,
  GENERATED_ESLINT_BANNER,
  TRANSFORMATION_OBLIGATION_FILE,
} from '../project';
import { renderGitignoreArtifactComment } from '../operational-contract';
import { removeIgnoreGroup, stripManagedSection } from './documents';
import { readText } from './references';
import { HANDBOOK_MARK } from './signatures';
import type { ApplicationRemoval, FileAction, RemovalReason } from './types';

const LEGACY_BACKUP = /^blueprint\.config\.mjs\.pre-v4-[0-9a-f]{64}$/;

export interface ProvenContext {
  root: string;
  prefix: string;
  blueprint: Blueprint | null;
  recordedIgnoreEdit: boolean;
}

export type ProvenRemoval = Omit<ApplicationRemoval, 'residues'>;

function at(context: ProvenContext, file: string): string {
  return path.posix.join(context.prefix, file);
}

function mergeTargets(blueprint: Blueprint | null): string[] {
  const configured = normalizeAgentEmit(blueprint?.emit?.agents)
    .filter((entry) => entry.path !== undefined)
    .filter((entry) => defaultAgentPaths().find((spec) => spec.target === entry.target)!
      .strategy === 'merge')
    .map((entry) => entry.path!);

  const defaults = defaultAgentPaths().filter((spec) => spec.strategy === 'merge')
    .map((spec) => spec.path);

  return [...new Set([...defaults, ...configured])];
}

function referenceOf(file: string): string {
  const extension = path.posix.extname(file);

  return extension
    ? `${file.slice(0, -extension.length)}.blueprint${extension}`
    : `${file}.blueprint`;
}

function namedFiles(context: ProvenContext): [string, RemovalReason][] {
  const own = defaultAgentPaths().filter((spec) => spec.strategy === 'own')
    .map((spec) => spec.path);

  const backups = fs.readdirSync(context.root).filter((name) => LEGACY_BACKUP.test(name));

  return [
    [CONFIG_FILE, 'config'],
    [BASELINE_FILE, 'baseline'],
    [AUTHORING_FILE, 'workflow'],
    [COMMAND_FILE, 'workflow'],
    [TRANSFORMATION_OBLIGATION_FILE, 'workflow'],
    ['eslint.config.blueprint.mjs', 'reference'],
    ...mergeTargets(context.blueprint)
      .map((file): [string, RemovalReason] => [referenceOf(file), 'reference']),
    ...backups.map((file): [string, RemovalReason] => [file, 'backup']),
    ...own.map((file): [string, RemovalReason] => [file, 'generated']),
  ];
}

function generatedFiles(context: ProvenContext): string[] {
  const handbook = handbookPath(context.blueprint ?? {} as Blueprint);

  const eslint = ESLINT_FILES.filter((file) =>
    readText(path.join(context.root, file))?.startsWith(GENERATED_ESLINT_BANNER));

  return readText(path.join(context.root, handbook))?.includes(HANDBOOK_MARK)
    ? [handbook, ...eslint]
    : eslint;
}

function sectionActions(context: ProvenContext, removal: ProvenRemoval): void {
  for (const file of mergeTargets(context.blueprint)) {
    const text = readText(path.join(context.root, file));

    if (text === null) {
      continue;
    }

    const strip = stripManagedSection(text);

    if (strip.status === 'malformed') {
      removal.conflicts.push({ kind: 'malformed-section', path: at(context, file) });
    } else if (strip.status === 'stripped') {
      removal.actions.push(strip.empty
        ? { kind: 'delete', path: at(context, file), reason: 'section' }
        : { kind: 'write', path: at(context, file), content: strip.text, reason: 'section' });
    }
  }
}

function ignoreGroup(context: ProvenContext): FileAction[] {
  const text = readText(path.join(context.root, '.gitignore'));

  const content = text === null || context.recordedIgnoreEdit
    ? null
    : removeIgnoreGroup(text, renderGitignoreArtifactComment());

  return content === null
    ? []
    : [{ kind: 'write', path: at(context, '.gitignore'), content, reason: 'gitignore' }];
}

export function provenRemoval(context: ProvenContext): ProvenRemoval {
  const removal: ProvenRemoval = { actions: [], conflicts: [] };

  const deletions: [string, RemovalReason][] = [
    ...namedFiles(context),
    ...generatedFiles(context).map((file): [string, RemovalReason] => [file, 'generated']),
  ];

  for (const [file, reason] of deletions) {
    if (fs.existsSync(path.join(context.root, file))) {
      removal.actions.push({ kind: 'delete', path: at(context, file), reason });
    }
  }

  sectionActions(context, removal);
  removal.actions.push(...ignoreGroup(context));

  return removal;
}
