import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

const RUNNING = { root: '/runner/node_modules/@kekkai/blueprint', version: '4.1.0' };
const LEGACY = { architecture: { alias: '~app', module: { private: ['hooks'] }, layers: [] } };

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-flow-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function install(version: string, app = '.'): void {
  write(path.posix.join(app, 'node_modules/@kekkai/blueprint/package.json'),
    JSON.stringify({ name: '@kekkai/blueprint', version, bin: { blueprint: 'dist/bin.js' } }));
}

function git(changes = ''): GitReader {
  return (args) => ({
    status: 0,
    stdout: args[0] === 'status' ? changes : args[1] === '--show-toplevel' ? root : 'true',
    stderr: '',
  });
}

function adoptLegacy(): void {
  write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': '^3.2.0' } }));
  write('package-lock.json', '{}');
  write('blueprint.config.mjs', 'export default {};\n');
  install('3.2.0');
}

const state = () => JSON.parse(
  fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8'),
);

const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const output = () => lines.join('\n');
const playbook = () => fs.readFileSync(path.join(root, 'blueprint-upgrade.md'), 'utf-8');

function options(patch: Partial<UpgradeOptions> = {}): UpgradeOptions {
  return {
    log: (line) => void lines.push(line),
    git: git(),
    loadConfig: async () => LEGACY,
    running: RUNNING,
    exec: () => install('4.1.0'),
    handoff: () => 7,
    reconcile: async () => {},
    verify: async (_root, application) => ({
      application,
      inspect: { ok: true, findings: 0 },
      doctor: { verdict: 'complete', failed: [], skipped: [] },
    }),
    ...patch,
  };
}

// eslint-disable-next-line max-lines-per-function
describe('runUpgrade · direct jump from a pre-lifecycle 3.2 adoption', () => {
  it('plans without mutation on --dry-run', async () => {
    adoptLegacy();

    expect(await runUpgrade(root, options({ dryRun: true }))).toBe(0);

    expect(output()).toContain('Blueprint upgrade — dry run (nothing was changed)');

    expect(output())
      .toContain('Source: 3.2.0 (installed @kekkai/blueprint; no lifecycle state yet, so this '
        + 'run establishes it)');

    expect(output()).toContain('Target: 4.1.0 (the running @kekkai/blueprint package is the only '
      + 'target authority)');

    expect(output()).toContain('Applications: `.` (installed 3.2.0)');
    expect(output()).toContain('Dependency: `npm install -D @kekkai/blueprint@4.1.0` in `.`');
    expect(output()).toContain('legacy-unit-shape → `.`');
    expect(output()).toContain('1. review-retired-module-private (4.0.0) → `.`');
    expect(output()).toContain('Safety: ✓ clean Git worktree');
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });

  it('records the pending plan before installing, then hands off to the installed '
    + 'copy', async () => {
    adoptLegacy();

    const exec = vi.fn(() => install('4.1.0'));
    const handoff = vi.fn(() => 7);

    expect(await runUpgrade(root, options({ exec, handoff }))).toBe(7);

    expect(exec).toHaveBeenCalledWith('npm install -D @kekkai/blueprint@4.1.0', root);

    expect(handoff).toHaveBeenCalledWith({
      root: path.join(root, 'node_modules/@kekkai/blueprint'), version: '4.1.0',
    }, root);

    expect(state()).toMatchObject({
      blueprint: '3.2.0',
      provenance: 'partial',
      pending: {
        from: '3.2.0',
        to: '4.1.0',
        migrations: ['legacy-unit-shape'],
        operations: [{
          id: 'review-retired-module-private', applications: ['.'], evidence: { '.': ['hooks'] },
        }],
        completed: [],
      },
    });
  });

  it('resumes after the handoff: reconciles, writes one playbook, and stays pending', async () => {
    adoptLegacy();
    await runUpgrade(root, options());
    write('blueprint.config.mjs.pre-v4-' + 'a'.repeat(64), 'export default {};\n');

    const reconcile = vi.fn(async () => {});

    expect(await runUpgrade(root, options({ reconcile, loadConfig: async () => ({}) }))).toBe(1);

    expect(reconcile).toHaveBeenCalledWith(root, expect.any(Function));
    expect(output()).toContain('Blueprint upgrade — resuming the pending upgrade');
    expect(output()).toContain('Upgrade pending — 1 semantic operation(s) need the coding Agent');
    expect(playbook()).toContain('# Blueprint upgrade playbook');
    expect(playbook()).toContain('`review-retired-module-private` — introduced in 4.0.0 — pending');
    expect(playbook()).toContain('Applications: `.` (measured: hooks)');

    expect(playbook())
      .toContain('`npx blueprint upgrade --complete review-retired-module-private`');

    expect(state().blueprint).toBe('3.2.0');
  });

  it('verifies each semantic operation before recording it and never repeats it', async () => {
    adoptLegacy();
    await runUpgrade(root, options());

    const backup = 'blueprint.config.mjs.pre-v4-' + 'b'.repeat(64);

    write(backup, 'export default {};\n');

    await expect(runUpgrade(root, options({ complete: 'review-retired-module-private' })))
      .rejects.toThrow(`review-retired-module-private is not done yet: ${backup} still exist.`);

    fs.rmSync(path.join(root, backup));

    expect(await runUpgrade(root, options({ complete: 'review-retired-module-private' }))).toBe(0);
    expect(state().pending.completed).toEqual(['review-retired-module-private']);
    expect(lines.at(-1)).toContain('0 semantic operation(s) remain; run `npx blueprint upgrade`');

    expect(playbook()).toContain('introduced in 4.0.0 — done — do not repeat');

    await expect(runUpgrade(root, options({ complete: 'review-retired-module-private' })))
      .rejects.toThrow('review-retired-module-private is not a pending semantic operation of '
        + 'this upgrade. Pending: none.');
  });

  it('records completion only after every application verifies', async () => {
    adoptLegacy();
    await runUpgrade(root, options());
    await runUpgrade(root, options({ complete: 'review-retired-module-private' }));
    write('blueprint-upgrade.md', '# stale\n');

    const failing = options({
      loadConfig: async () => ({}),
      verify: async (_root, application) => ({
        application, inspect: { ok: false, findings: 2 },
        doctor: { verdict: 'incomplete', failed: ['eslint wired'], skipped: ['merged rules'] },
      }),
    });

    expect(await runUpgrade(root, failing)).toBe(1);

    expect(output())
      .toContain('✗ inspect --baseline failed in `.` (2 finding(s) outside the baseline)');

    expect(output())
      .toContain('✗ doctor incomplete in `.` — failed: eslint wired — could not run: merged rules');

    expect(state().pending).not.toBeNull();

    expect(await runUpgrade(root, options({ loadConfig: async () => ({}) }))).toBe(0);

    expect(state()).toMatchObject({
      blueprint: '4.1.0', operations: ['review-retired-module-private'], pending: null,
    });

    expect(exists('blueprint-upgrade.md')).toBe(false);
    expect(lines.at(-1)).toContain('Blueprint upgrade complete: lifecycle 3.2.0 → 4.1.0 recorded');

    expect(await runUpgrade(root, options({ loadConfig: async () => ({}) }))).toBe(0);
    expect(lines.at(-1)).toContain('Blueprint lifecycle 4.1.0 is current — nothing to upgrade.');
  });

  it('keeps the lifecycle pending when final workflow-artifact retirement fails', async () => {
    adoptLegacy();
    await runUpgrade(root, options());
    await runUpgrade(root, options({ complete: 'review-retired-module-private' }));
    write('blueprint-upgrade.md', '# pending finalization\n');

    await expect(runUpgrade(root, options({
      loadConfig: async () => ({}),
      retire: () => { throw new Error('retirement interrupted'); },
    }))).rejects.toThrow('retirement interrupted');

    expect(state()).toMatchObject({ blueprint: '3.2.0' });
    expect(state().pending).not.toBeNull();
    expect(exists('blueprint-upgrade.md')).toBe(true);

    expect(await runUpgrade(root, options({ loadConfig: async () => ({}) }))).toBe(0);
    expect(state()).toMatchObject({ blueprint: '4.1.0', pending: null });
  });
});

describe('runUpgrade · a 4.0 adoption whose package was updated past lifecycle state', () => {
  const CURRENT = { framework: 'vue', architecture: { alias: '~app', layers: [] } };

  function history(commits: string): GitReader {
    return (args, cwd) => args[0] === 'rev-list'
      ? { status: 0, stdout: commits, stderr: '' }
      : args[1] === '--is-shallow-repository'
        ? { status: 0, stdout: 'false\n', stderr: '' }
        : git()(args, cwd);
  }

  function adoptUpdated(): void {
    write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': '^4.0.0' } }));
    write('package-lock.json', '{}');
    write('blueprint.config.mjs', 'export default {};\n');
    install('4.1.0');
  }

  it('dates the adoption from the installed package when state never entered Git', async () => {
    adoptUpdated();

    const dryRun = options({ dryRun: true, git: history(''), loadConfig: async () => CURRENT });

    expect(await runUpgrade(root, dryRun)).toBe(0);

    expect(output()).toContain('Source: 4.1.0 (installed @kekkai/blueprint; no commit reachable '
      + 'from any ref holds .blueprint-lifecycle.json, so no lifecycle is proven and this run '
      + 'establishes it)');

    expect(exists('.blueprint-lifecycle.json')).toBe(false);

    lines = [];

    const run = options({ git: history(''), loadConfig: async () => CURRENT });

    expect(await runUpgrade(root, run)).toBe(0);
    expect(state()).toMatchObject({ blueprint: '4.1.0', pending: null });
  });

  it('still refuses when the state file once entered Git history', async () => {
    adoptUpdated();

    const run = options({ git: history('abc\n'), loadConfig: async () => CURRENT });

    await expect(runUpgrade(root, run)).rejects.toThrow('.blueprint-lifecycle.json is missing, '
      + 'but @kekkai/blueprint 4.1.0 always records it');

    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });
});
