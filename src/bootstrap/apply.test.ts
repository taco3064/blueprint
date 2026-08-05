import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apply } from './apply';
import type { Action } from './types';

let root: string;

const noExec = (): void => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-apply-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('apply · removing init\'s own output', () => {
  it('takes an already-absent path as removed, not as a failure', () => {
    // rm actions are planned from a scan and applied afterwards, so a scaffold
    // file the user deleted in between is simply gone. Letting the removal throw
    // aborts the run at that point, and every action planned below it never
    // lands — after the plan already announced all of them (field issue #37).
    const actions: Action[] = [
      { kind: 'rm', path: 'src/components/Placeholder.vue', note: 'drop the pristine scaffold' },
      { kind: 'write', path: 'blueprint.config.mjs', content: '// authored', note: 'the contract' },
    ];

    const applied: string[] = [];

    expect(() => apply(root, actions, noExec, (action) => applied.push(action.kind)))
      .not.toThrow();

    expect(applied).toEqual(['rm', 'write']);
    expect(fs.existsSync(path.join(root, 'blueprint.config.mjs'))).toBe(true);
  });

  it('does remove the file when it is there', () => {
    const scaffold = path.join(root, 'src/components/Placeholder.vue');

    fs.mkdirSync(path.dirname(scaffold), { recursive: true });
    fs.writeFileSync(scaffold, 'export default {};');

    apply(root, [{ kind: 'rm', path: 'src/components/Placeholder.vue', note: 'x' }], noExec, noExec);

    expect(fs.existsSync(scaffold)).toBe(false);
  });
});
