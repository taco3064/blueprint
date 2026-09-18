import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LIFECYCLE_DRAFT,
  LIFECYCLE_FILE,
  readLifecycleState,
  serializeLifecycleState,
  writeLifecycleState,
} from './state';
import type { LifecycleState } from './types';

const recorded: LifecycleState = {
  schema: 1, blueprint: '4.0.0', provenance: 'complete', operations: [], pending: null,
  applications: { '.': { provenance: [{ kind: 'directory', path: 'src/pages' }] } },
};

const next: LifecycleState = { ...recorded, blueprint: '4.1.0' };

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-write-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const at = (file: string) => path.join(root, file);
const authority = () => fs.readFileSync(at(LIFECYCLE_FILE), 'utf-8');

function observeReplacement() {
  const rename = fs.renameSync;
  const seen: { authority: string; draft: string }[] = [];

  const spies = {
    open: vi.spyOn(fs, 'openSync'),
    write: vi.spyOn(fs, 'writeFileSync'),
    flush: vi.spyOn(fs, 'fsyncSync'),
    close: vi.spyOn(fs, 'closeSync'),
    replace: vi.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => {
      seen.push({ authority: authority(), draft: fs.readFileSync(from, 'utf-8') });
      rename(from, to);
    }),
  };

  return { seen, spies };
}

describe('writeLifecycleState · atomic replacement', () => {
  it('replaces the authority only after the complete new state is on disk', () => {
    writeLifecycleState(root, recorded);

    const { seen, spies } = observeReplacement();
    const { open, write, flush, close, replace } = spies;

    writeLifecycleState(root, next);

    expect(open).toHaveBeenCalledWith(at(LIFECYCLE_DRAFT), 'w');
    expect(replace).toHaveBeenCalledWith(at(LIFECYCLE_DRAFT), at(LIFECYCLE_FILE));

    expect(seen).toEqual([{
      authority: serializeLifecycleState(recorded), draft: serializeLifecycleState(next),
    }]);

    const order = [write, flush, close, replace].map((spy) => spy.mock.invocationCallOrder[0]);

    expect(order.every((call) => call !== undefined)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(authority()).toBe(serializeLifecycleState(next));
    expect(fs.existsSync(at(LIFECYCLE_DRAFT))).toBe(false);
  });

  it('keeps the authority and discards the draft when the write is interrupted', () => {
    writeLifecycleState(root, recorded);

    const write = fs.writeFileSync;
    const close = vi.spyOn(fs, 'closeSync');

    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((descriptor, text) => {
      write(descriptor, String(text).slice(0, 12));

      throw new Error('ENOSPC: no space left on device');
    });

    expect(() => writeLifecycleState(root, next)).toThrow('ENOSPC: no space left on device');
    expect(close).toHaveBeenCalledTimes(1);
    expect(authority()).toBe(serializeLifecycleState(recorded));
    expect(readLifecycleState(root)).toEqual({ status: 'present', state: recorded });
    expect(fs.existsSync(at(LIFECYCLE_DRAFT))).toBe(false);
  });

  it('never reads a stale draft as the authority and overwrites it on the next write', () => {
    fs.writeFileSync(at(LIFECYCLE_DRAFT), serializeLifecycleState(next));

    expect(LIFECYCLE_DRAFT).toBe('.blueprint-lifecycle.json.tmp');
    expect(readLifecycleState(root)).toEqual({ status: 'missing' });

    writeLifecycleState(root, recorded);

    expect(readLifecycleState(root)).toEqual({ status: 'present', state: recorded });
    expect(fs.existsSync(at(LIFECYCLE_DRAFT))).toBe(false);
  });
});
