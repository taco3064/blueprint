import fs from 'node:fs';
import path from 'node:path';

import { digest } from '../lifecycle';
import type { ProvenanceRecord } from '../lifecycle';
import {
  restoreScript,
  reverseEdit,
  strippedSection,
  stripManagedSection,
} from './documents';
import { readText } from './references';
import { carriesBlueprintSignature } from './signatures';
import type { ApplicationRemoval, FileResidue } from './types';

export interface RecordedContext {
  root: string;
  prefix: string;
  records: readonly ProvenanceRecord[];
  aliasInUse: (file: string) => string | null;
  provenDeletions: ReadonlySet<string>;
}

type Edit = Extract<ProvenanceRecord, { kind: 'edit' }>;
type Script = Extract<ProvenanceRecord, { kind: 'script' }>;

function recordsOf<K extends ProvenanceRecord['kind']>(
  context: RecordedContext,
  kind: K,
): Extract<ProvenanceRecord, { kind: K }>[] {
  return context.records.filter((record): record is Extract<ProvenanceRecord, { kind: K }> =>
    record.kind === kind);
}

function byPath<T extends { path: string }>(records: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const record of records) {
    grouped.set(record.path, [...grouped.get(record.path) ?? [], record]);
  }

  return grouped;
}

function residueFor(context: RecordedContext, file: string): FileResidue | null {
  const alias = context.aliasInUse(file);

  return alias === null ? null : { kind: 'required-by-source', path: at(context, file), alias };
}

const at = (context: RecordedContext, file: string) => path.posix.join(context.prefix, file);

interface Reversal extends ApplicationRemoval {
  text: string | null;
}

function generatedFiles(context: RecordedContext, removal: ApplicationRemoval): void {
  for (const record of recordsOf(context, 'generated')) {
    const text = readText(path.join(context.root, record.path));

    if (text !== null && carriesBlueprintSignature(text)) {
      removal.actions.push({ kind: 'delete', path: at(context, record.path), reason: 'generated' });
    } else if (text !== null) {
      removal.residues.push({ kind: 'modified', path: at(context, record.path) });
    }
  }
}

function createdFiles(
  context: RecordedContext,
  removal: ApplicationRemoval,
  reversals: ReadonlyMap<string, Reversal>,
): Set<string> {
  const deleted = new Set<string>();

  for (const record of recordsOf(context, 'created')) {
    const reversal = reversals.get(record.path);

    const text = reversal === undefined
      ? readText(path.join(context.root, record.path))
      : reversal.text;

    const kept = residueFor(context, record.path);

    if (text === null) {
      continue;
    }

    if (kept !== null) {
      removal.residues.push(kept);
    } else if (digest(text) === record.sha256) {
      deleted.add(record.path);
      removal.actions.push({ kind: 'delete', path: at(context, record.path), reason: 'created' });
    } else {
      removal.residues.push({ kind: 'modified', path: at(context, record.path) });
    }
  }

  return deleted;
}

function reverseFile(context: RecordedContext, file: string, edits: Edit[]): Reversal {
  const removal: Reversal = { actions: [], conflicts: [], residues: [], text: null };
  const original = readText(path.join(context.root, file));
  const kept = residueFor(context, file);

  if (original === null || kept !== null) {
    return { ...removal, residues: kept === null ? [] : [kept] };
  }

  let text = original;

  for (const edit of [...edits].reverse()) {
    const result = reverseEdit(text, edit);

    if (result.status === 'reversed') {
      text = result.text;
    } else if (result.status === 'ambiguous') {
      removal.conflicts.push({
        kind: 'ambiguous-edit', path: at(context, file), occurrences: result.occurrences,
      });
    } else if (result.status === 'irreversible') {
      removal.conflicts.push({ kind: 'irreversible-edit', path: at(context, file) });
    }
  }

  if (text !== original) {
    removal.actions.push({ kind: 'write', path: at(context, file), content: text, reason: 'edit' });
  }

  return { ...removal, text };
}

function sections(context: RecordedContext, removal: ApplicationRemoval): void {
  for (const record of recordsOf(context, 'section')) {
    const text = readText(path.join(context.root, record.path));

    if (text === null) {
      continue;
    }

    const strip = stripManagedSection(text);

    if (strip.status === 'malformed') {
      removal.conflicts.push({ kind: 'malformed-section', path: at(context, record.path) });
    } else if (strip.status === 'stripped') {
      const outcome = strippedSection(at(context, record.path), strip, record.created);

      removal.actions.push(outcome.action);
      removal.residues.push(...outcome.residues);
    }
  }
}

function restoreFile(
  context: RecordedContext,
  file: string,
  scripts: Script[],
): ApplicationRemoval {
  const removal: ApplicationRemoval = { actions: [], conflicts: [], residues: [] };
  const original = readText(path.join(context.root, file));

  if (original === null) {
    return removal;
  }

  let text = original;

  for (const script of scripts) {
    const result = restoreScript(text, script);

    if (result.status === 'restored') {
      text = result.text;
    } else if (result.status === 'diverged') {
      removal.conflicts.push({
        kind: 'diverged-script', path: at(context, file), name: script.name,
        expected: script.after, current: result.current,
      });
    } else if (result.status === 'unreadable') {
      removal.conflicts.push({ kind: 'unreadable-manifest', path: at(context, file) });
    }
  }

  if (text !== original) {
    removal.actions.push({
      kind: 'write', path: at(context, file), content: text, reason: 'script',
    });
  }

  return removal;
}

function directories(context: RecordedContext, removal: ApplicationRemoval): void {
  for (const record of recordsOf(context, 'directory')) {
    const full = path.join(context.root, record.path);

    if (!fs.existsSync(full)) {
      continue;
    }

    const entries = fs.readdirSync(full);

    if (entries.every((entry) => entry === '.gitkeep')) {
      const gitkeep = path.posix.join(record.path, '.gitkeep');

      removal.actions.push(
        ...entries.map(() => ({
          kind: 'delete' as const, path: at(context, gitkeep), reason: 'directory' as const,
        })),
        { kind: 'rmdir', path: at(context, record.path), reason: 'directory' },
      );
    } else {
      removal.residues.push({ kind: 'directory-in-use', path: at(context, record.path) });
    }
  }
}

export function recordedRemoval(context: RecordedContext): ApplicationRemoval {
  const removal: ApplicationRemoval = { actions: [], conflicts: [], residues: [] };

  const reversals = new Map([...byPath(recordsOf(context, 'edit'))]
    .map(([file, edits]) => [file, reverseFile(context, file, edits)] as const));

  generatedFiles(context, removal);

  const deleted = createdFiles(context, removal, reversals);

  const parts = [
    ...[...reversals].flatMap(([file, reversal]) =>
      deleted.has(file) || context.provenDeletions.has(file) ? [] : [reversal]),
    ...[...byPath(recordsOf(context, 'script'))]
      .map(([file, scripts]) => restoreFile(context, file, scripts)),
  ];

  for (const part of parts) {
    removal.actions.push(...part.actions);
    removal.conflicts.push(...part.conflicts);
    removal.residues.push(...part.residues);
  }

  sections(context, removal);
  directories(context, removal);

  return removal;
}
