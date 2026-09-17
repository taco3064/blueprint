import path from 'node:path';

import { textHunks } from './hunks';
import { digest, isRecord } from './provenance';
import type { ProvenanceRecord } from './types';

export type AppliedAction
  = | {
    kind: 'write';
    path: string;
    content: string;
    before: string | null;
    ownership?: 'generated' | 'section';
  }
  | { kind: 'mkdir'; path: string }
  | { kind: 'rm'; path: string }
  | { kind: 'install'; dependencies: readonly string[] };

export interface AdoptionProvenance {
  records: ProvenanceRecord[];
  removed: string[];
}

function scripts(text: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(text);

    if (!isRecord(parsed)) {
      return null;
    }

    const value = parsed.scripts ?? {};

    return typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'string'))
      : null;
  } catch {
    return null;
  }
}

function scriptRecords(
  write: Extract<AppliedAction, { kind: 'write' }> & { before: string },
): ProvenanceRecord[] | null {
  const before = scripts(write.before);
  const after = scripts(write.content);

  if (before === null || after === null) {
    return null;
  }

  return Object.entries(after)
    .filter(([name, value]) => before[name] !== value)
    .map(([name, value]) => ({
      kind: 'script', path: write.path, name, before: before[name] ?? null, after: value,
    }));
}

function writeRecords(write: Extract<AppliedAction, { kind: 'write' }>): ProvenanceRecord[] {
  if (write.ownership === 'generated') {
    return [{ kind: 'generated', path: write.path }];
  }

  if (write.ownership === 'section') {
    return [{ kind: 'section', path: write.path, created: write.before === null }];
  }

  if (write.before === null) {
    return [{ kind: 'created', path: write.path, sha256: digest(write.content) }];
  }

  const script = path.posix.basename(write.path) === 'package.json'
    ? scriptRecords({ ...write, before: write.before })
    : null;

  return script ?? textHunks(write.before, write.content)
    .map((hunk) => ({ kind: 'edit', path: write.path, ...hunk }));
}

export function adoptionProvenance(actions: readonly AppliedAction[]): AdoptionProvenance {
  const records: ProvenanceRecord[] = [];
  const removed: string[] = [];

  for (const action of actions) {
    if (action.kind === 'write') {
      records.push(...writeRecords(action));
    } else if (action.kind === 'mkdir') {
      records.push({ kind: 'directory', path: action.path });
    } else if (action.kind === 'rm') {
      removed.push(action.path);
    } else {
      records.push(...action.dependencies.map((name) => ({ kind: 'dependency' as const, name })));
    }
  }

  return { records, removed };
}
