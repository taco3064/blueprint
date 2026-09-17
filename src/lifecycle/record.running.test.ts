import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAdoption } from './record';

vi.mock('./package', async (original) => ({
  ...await original<typeof import('./package')>(),
  runningPackage: () => null,
}));

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-running-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('recordAdoption without a readable running package', () => {
  it('does not claim a first-adoption checkpoint it cannot name', () => {
    expect(recordAdoption({
      lifecycleRoot: root,
      applicationRoot: root,
      applied: [{ kind: 'mkdir', path: 'src' }],
      firstAdoption: true,
      legacyShape: false,
    })).toEqual({ status: 'skipped', reason: 'unproven-checkpoint' });
  });
});
