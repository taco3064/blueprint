import { createHash } from 'node:crypto';

import type { ProvenanceRecord } from './types';

export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

function target(record: ProvenanceRecord): string {
  const { path, name } = record as { path?: string; name?: string };

  return JSON.stringify([record.kind, path, name]);
}

function merged(existing: ProvenanceRecord, incoming: ProvenanceRecord): ProvenanceRecord {
  if (existing.kind === 'section') {
    const next = incoming as typeof existing;

    return { ...next, created: existing.created || next.created };
  }

  if (existing.kind === 'script') {
    const next = incoming as typeof existing;

    return next.before === existing.after ? { ...next, before: existing.before } : next;
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

    const index = records.findIndex((entry) => target(entry) === target(record));

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
