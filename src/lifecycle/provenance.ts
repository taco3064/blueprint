import { createHash } from 'node:crypto';

import type { ProvenanceRecord } from './types';

export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): value is string => typeof value === 'string';

const SHAPES: Record<ProvenanceRecord['kind'], (value: Record<string, unknown>) => boolean> = {
  generated: (value) => text(value.path),
  created: (value) => text(value.path) && text(value.sha256),
  section: (value) => text(value.path) && typeof value.created === 'boolean',
  edit: (value) => text(value.path) && text(value.before) && text(value.after),
  script: (value) => text(value.path) && text(value.name) && text(value.after)
    && (value.before === null || text(value.before)),
  directory: (value) => text(value.path),
  dependency: (value) => text(value.name),
};

export function parseProvenance(value: unknown): ProvenanceRecord[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const valid = value.every((entry) => isRecord(entry)
    && Object.hasOwn(SHAPES, String(entry.kind))
    && SHAPES[entry.kind as ProvenanceRecord['kind']](entry));

  return valid ? value as ProvenanceRecord[] : null;
}

function sameTarget(left: ProvenanceRecord, right: ProvenanceRecord): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'dependency') {
    return left.name === (right as typeof left).name;
  }

  if (left.kind === 'script') {
    const other = right as typeof left;

    return left.path === other.path && left.name === other.name;
  }

  return left.path === (right as { path: string }).path;
}

function merged(existing: ProvenanceRecord, incoming: ProvenanceRecord): ProvenanceRecord {
  if (existing.kind === 'section' && incoming.kind === 'section') {
    return { ...incoming, created: existing.created || incoming.created };
  }

  if (existing.kind === 'script' && incoming.kind === 'script') {
    return incoming.before === existing.after ? { ...incoming, before: existing.before } : incoming;
  }

  return existing;
}

export function mergeProvenance(
  existing: readonly ProvenanceRecord[],
  incoming: readonly ProvenanceRecord[],
): ProvenanceRecord[] {
  const records = [...existing];

  for (const record of incoming) {
    if (record.kind === 'edit') {
      const duplicate = records.some((entry) => entry.kind === 'edit'
        && entry.path === record.path && entry.before === record.before
        && entry.after === record.after);

      if (!duplicate) {
        records.push(record);
      }

      continue;
    }

    const index = records.findIndex((entry) => sameTarget(entry, record));

    if (index === -1) {
      records.push(record);
    } else {
      records[index] = merged(records[index], record);
    }
  }

  return records;
}

export function forgetPaths(
  records: readonly ProvenanceRecord[],
  paths: readonly string[],
): ProvenanceRecord[] {
  const removed = new Set(paths);

  return records.filter((record) => !('path' in record) || !removed.has(record.path));
}
