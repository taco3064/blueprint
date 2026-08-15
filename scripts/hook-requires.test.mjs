import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The preflight, driven the way git drives it: through the tracked `.husky/_` shim, in a
 * staged tree that has never installed anything. What could be wrong here is not whether
 * the script runs — it is what it says. Swapping its two argument kinds produces a
 * grammatical sentence that still contains `npm ci`, so every case below asserts the
 * refusal whole rather than a fragment of it, and the expected strings are written out
 * rather than built from the hook name the code derives them from.
 */

const REPO = path.resolve(import.meta.dirname, '..');

// The commands each hook shells out to. Restated here because the hook keeps them in a
// shell argument list, where a dropped member leaves nothing to turn red.
const DECLARED = {
  'pre-commit': ['lint-staged', 'tsc', 'vitest'],
  'pre-push': ['vitest'],
};

const REFUSAL = {
  'pre-commit':
    'blueprint - `lint-staged` is not installed in this tree, so the pre-commit gate '
    + 'cannot run: run `npm ci` here (each checkout needs its own install), then commit again.',
  'pre-push':
    'blueprint - `vitest` is not installed in this tree, so the pre-push gate '
    + 'cannot run: run `npm ci` here (each checkout needs its own install), then push again.',
};

/** A checkout of the tracked files a hook needs, and nothing else — no node_modules. */
const stage = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-hook-'));

  fs.cpSync(path.join(REPO, '.husky'), path.join(dir, '.husky'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(
    path.join(REPO, 'scripts', 'hook-requires.sh'),
    path.join(dir, 'scripts', 'hook-requires.sh'),
  );

  return dir;
};

const bin = (dir, name, body) => {
  const dot = path.join(dir, 'node_modules', '.bin');

  fs.mkdirSync(dot, { recursive: true });
  fs.writeFileSync(path.join(dot, name), `#!/bin/sh\n${body}\n`);
  fs.chmodSync(path.join(dot, name), 0o755);
};

// `HOME` and `XDG_CONFIG_HOME` point into the staged tree so `_/h` cannot source the real
// `~/.config/husky/init.sh`, whose PATH edits belong to whoever runs the suite. PATH is the
// system utilities and nothing else: `npm test` puts this repo's `node_modules/.bin` on
// PATH, and all three declared commands live there, so an inherited PATH would resolve
// every command these cases need absent. `node_modules/.bin` is `_/h`'s to add, relative
// to the tree under test.
const run = (dir, argv) =>
  spawnSync('sh', argv, {
    cwd: dir,
    encoding: 'utf8',
    env: { HOME: dir, XDG_CONFIG_HOME: path.join(dir, '.config'), PATH: '/usr/bin:/bin' },
  });

// The cases below execute the hook. That PATH is the POSIX one, and on the Windows leg
// `spawnSync` returned `status: null` for every one of them — no `sh` to start. What git
// runs on Windows is Git Bash's `sh`, reachable only through Git-for-Windows' own utility
// directories, and hard-coding those into the harness would trade a real subject for a
// guess about an install layout. So execution is measured where the shim husky generates
// (`#!/usr/bin/env sh`) is the shell git will use, and the two cases that read the hook
// text — the contract between hook and script — keep running on both platforms.
const posix = it.skipIf(process.platform === 'win32');

describe.each(Object.keys(DECLARED))('%s', (hook) => {
  it('calls the preflight with its own name and every command it runs', () => {
    const body = fs.readFileSync(path.join(REPO, '.husky', hook), 'utf8');

    expect(body.split('\n').filter((line) => line.startsWith('sh ')))
      .toEqual([`sh scripts/hook-requires.sh ${hook} ${DECLARED[hook].join(' ')}`]);
  });

  posix('refuses a tree with no install, naming npm ci, and husky adds only code 1', () => {
    const { status, stdout, stderr } = run(stage(), [`.husky/_/${hook}`]);

    // Exit 1 rather than the 127 a missing command would have produced: 127 is what
    // `_/h` answers with a PATH dump, which is the message this refusal replaces.
    expect(status).toBe(1);
    expect(stderr.trim()).toBe(REFUSAL[hook]);
    expect(stdout.trim()).toBe(`husky - ${hook} script failed (code 1)`);
  });

  posix('refuses the same way when node_modules is there and the command is not', () => {
    const dir = stage();

    fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });

    const { status, stderr } = run(dir, [`.husky/_/${hook}`]);

    expect(status).toBe(1);
    expect(stderr.trim()).toBe(REFUSAL[hook]);
  });

  posix.each(DECLARED[hook])('checks %s, wherever it sits in the list', (missing) => {
    const argv = DECLARED[hook].map((cmd) => (cmd === missing ? cmd : 'sh'));
    const { status, stderr } = run(stage(), ['scripts/hook-requires.sh', hook, ...argv]);

    expect(status).toBe(1);
    expect(stderr).toContain(`\`${missing}\` is not installed in this tree`);
  });

  posix('says nothing and exits 0 when every command resolves', () => {
    const argv = DECLARED[hook].map(() => 'sh');
    const { status, stdout, stderr } = run(stage(), ['scripts/hook-requires.sh', hook, ...argv]);

    expect({ status, stdout, stderr }).toEqual({ status: 0, stdout: '', stderr: '' });
  });
});

posix('leaves a real failure its own output, with no refusal in front of it', () => {
  const dir = stage();

  // Every declared command resolves, so the preflight passes and the hook runs. The first
  // one fails the way a lint error fails, and `sh -e` stops there.
  bin(dir, 'lint-staged', 'echo "no-unused-vars: probe.ts" >&2\nexit 1');
  bin(dir, 'tsc', 'exit 0');
  bin(dir, 'vitest', 'exit 0');

  const { status, stdout, stderr } = run(dir, ['.husky/_/pre-commit']);

  expect(status).toBe(1);
  expect(stderr.trim()).toBe('no-unused-vars: probe.ts');
  expect(stdout.trim()).toBe('husky - pre-commit script failed (code 1)');
});
