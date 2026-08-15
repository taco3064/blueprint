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

  it('refuses a list that would leave the root, before anything lands', () => {
    // apply is the last boundary between an action list and the filesystem, so it
    // guards even when the list did not come from `plan`. The first action is
    // perfectly legal and must still not land: a boundary enforced action-by-action
    // leaves the run half-applied at the file it refused.
    //
    // The project root is a subdirectory of the fixture, so "outside the root" is
    // still inside what this test owns and cleans. Asserting on `$TMPDIR` directly is
    // an assertion about shared global state, and it poisoned itself: a mutation run
    // executed a mutant with the guard removed, the write landed in `$TMPDIR` for
    // real, and every later run of this test then saw the file it asserts is absent.
    const project = path.join(root, 'project');
    const outside = path.join(root, 'escaped.md');

    fs.mkdirSync(project);

    const actions: Action[] = [
      { kind: 'write', path: 'blueprint.config.mjs', content: '// authored', note: 'config' },
      { kind: 'write', path: '../escaped.md', content: 'outside', note: 'escaped' },
      // Absolute, and still inside the fixture — containment is judged against the
      // project root, not against how exotic the path looks.
      { kind: 'write', path: outside, content: 'outside', note: 'absolute' },
    ];

    const applied: string[] = [];

    expect(() => apply(project, actions, noExec, (action) => applied.push(action.kind)))
      .toThrow(/outside the project root/);

    expect(applied).toEqual([]);
    expect(fs.existsSync(path.join(project, 'blueprint.config.mjs'))).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('does remove the file when it is there', () => {
    const scaffold = path.join(root, 'src/components/Placeholder.vue');

    fs.mkdirSync(path.dirname(scaffold), { recursive: true });
    fs.writeFileSync(scaffold, 'export default {};');

    apply(root, [{ kind: 'rm', path: 'src/components/Placeholder.vue', note: 'x' }], noExec,
      noExec);

    expect(fs.existsSync(scaffold)).toBe(false);
  });
});

describe('apply · announcing the install', () => {
  const install: Action[] = [{ kind: 'install', command: 'npm i -D eslint', note: 'the carrier' }];

  // The announcer is optional, and nothing in the tree asserted that. Every caller
  // passes one, so making the call unconditional left the suite green while `apply`
  // gained a crash for any caller that does not — and optionality is the point: the
  // narration is an addition to `apply`, not a requirement of it.
  it('runs the install with no announcer attached', () => {
    const ran: string[] = [];
    const applied: string[] = [];

    expect(() => apply(root, install, (command) => ran.push(command), (a) => applied.push(a.kind)))
      .not.toThrow();

    // Not just "did not throw": a guard that skipped the action instead of the
    // callback would satisfy that on its own.
    expect(ran).toEqual(['npm i -D eslint']);
    expect(applied).toEqual(['install']);
  });

  // BEFORE, which is the whole reason this callback exists rather than reusing
  // `onApplied`: the install spawns a package manager that can sit for minutes, and
  // two codex runs read that silence as a hung tool and killed it (field runs #131,
  // #132). An announcement that arrives after the wait reports nothing.
  it('announces the install before running it, not after', () => {
    const order: string[] = [];

    apply(
      root,
      install,
      (command) => order.push(`exec ${command}`),
      (a) => order.push(`applied ${a.kind}`),
      (a) => order.push(`starting ${a.command}`),
    );

    expect(order).toEqual(['starting npm i -D eslint', 'exec npm i -D eslint', 'applied install']);
  });
});
