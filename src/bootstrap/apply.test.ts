import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apply, pathExists } from './apply';
import type { Action } from './types';
import type { OperationalText } from '../operational-contract';

let root: string;

const noExec = (): void => {};

const note = (value: string): OperationalText => value as OperationalText;

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
      {
        kind: 'rm',
        path: 'src/components/Placeholder.vue',
        note: note('drop the pristine scaffold'),
      },
      {
        kind: 'write',
        path: 'blueprint.config.mjs',
        content: '// authored',
        note: note('the contract'),
      },
    ];

    const applied: string[] = [];

    expect(() => apply(root, actions, { exec: noExec, onApplied: (a) => applied.push(a.kind) }))
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
      { kind: 'write', path: 'blueprint.config.mjs', content: '// authored', note: note('config') },
      { kind: 'write', path: '../escaped.md', content: 'outside', note: note('escaped') },
      // Absolute, and still inside the fixture — containment is judged against the
      // project root, not against how exotic the path looks.
      { kind: 'write', path: outside, content: 'outside', note: note('absolute') },
    ];

    const applied: string[] = [];

    expect(() => apply(project, actions, { exec: noExec, onApplied: (a) => applied.push(a.kind) }))
      .toThrow(/outside the project root/);

    expect(applied).toEqual([]);
    expect(fs.existsSync(path.join(project, 'blueprint.config.mjs'))).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('does remove the file when it is there', () => {
    const scaffold = path.join(root, 'src/components/Placeholder.vue');

    fs.mkdirSync(path.dirname(scaffold), { recursive: true });
    fs.writeFileSync(scaffold, 'export default {};');

    apply(
      root,
      [{ kind: 'rm', path: 'src/components/Placeholder.vue', note: note('x') }],
      { exec: noExec, onApplied: noExec },
    );

    expect(fs.existsSync(scaffold)).toBe(false);
  });

  it('does not report a removal whose effect leaves the target present', () => {
    const file = path.join(root, 'blueprint-authoring.md');
    const applied: string[] = [];

    fs.writeFileSync(file, 'decisions');

    expect(() => apply(root, [{
      kind: 'rm', path: 'blueprint-authoring.md', note: note('retire decisions'),
    }], {
      exec: noExec,
      remove: () => {},
      onApplied: (action) => applied.push(action.kind),
    })).toThrow('blueprint-authoring.md still exists');

    expect(fs.readFileSync(file, 'utf8')).toBe('decisions');
    expect(applied).toEqual([]);
  });

  it('treats an already-absent target as verified with a no-op remover', () => {
    const applied: string[] = [];

    apply(root, [{ kind: 'rm', path: 'gone.md', note: note('already gone') }], {
      exec: noExec,
      remove: () => {},
      onApplied: (action) => applied.push(action.kind),
    });

    expect(applied).toEqual(['rm']);
  });

  it('does not treat an unreadable target as absent', () => {
    const failure = Object.assign(new Error('denied'), { code: 'EACCES' });

    const lstat = vi.spyOn(fs, 'lstatSync').mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => pathExists(path.join(root, 'blocked'))).toThrow(failure);
    lstat.mockRestore();
  });
});

describe('apply · announcing the install', () => {
  const install: Action[] = [{
    kind: 'install', command: 'npm i -D eslint', note: note('the carrier'),
  }];

  // The announcer is optional, and nothing in the tree asserted that. Every caller
  // passes one, so making the call unconditional left the suite green while `apply`
  // gained a crash for any caller that does not — and optionality is the point: the
  // narration is an addition to `apply`, not a requirement of it.
  it('runs the install with no announcer attached', () => {
    const ran: string[] = [];
    const applied: string[] = [];

    expect(() => apply(root, install, {
      exec: (command) => ran.push(command),
      onApplied: (a) => applied.push(a.kind),
    })).not.toThrow();

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

    apply(root, install, {
      exec: (command) => order.push(`exec ${command}`),
      onApplied: (a) => order.push(`applied ${a.kind}`),
      onInstallStarting: (a) => order.push(`starting ${a.command}`),
    });

    expect(order).toEqual(['starting npm i -D eslint', 'exec npm i -D eslint', 'applied install']);
  });

  it('runs an owned install from its dependency consumer root', () => {
    const workspace = path.join(root, 'workspace');
    const application = path.join(workspace, 'apps/web');
    const calls: string[] = [];

    apply(application, [{
      kind: 'install',
      command: 'pnpm add -Dw eslint',
      note: note('workspace lint dependency'),
      cwd: workspace,
    }], {
      exec: (command, cwd) => calls.push(`${command} @ ${cwd}`),
      onApplied: noExec,
    });

    expect(calls).toEqual([`pnpm add -Dw eslint @ ${workspace}`]);
  });
});
