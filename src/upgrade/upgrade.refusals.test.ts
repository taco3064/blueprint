import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

const RUNNING = { root: '/runner', version: '4.1.0' };

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-refusal-')));
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
    JSON.stringify({ name: '@kekkai/blueprint', version }));
}

function adopt(app = '.', version = '4.0.0'): void {
  write(path.posix.join(app, 'package.json'),
    JSON.stringify({ dependencies: { '@kekkai/blueprint': `^${version}` } }));

  write(path.posix.join(app, 'blueprint.config.mjs'), 'export default {};\n');
  install(version, app);
}

function lifecycle(patch: Record<string, unknown>): void {
  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1,
    blueprint: '4.1.0',
    provenance: 'complete',
    operations: [],
    pending: null,
    applications: {},
    ...patch,
  }));
}

const repository: GitReader = (args) => ({
  status: 0,
  stdout: args[0] === 'status' ? '' : args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

const dirty: GitReader = (args) => ({
  ...repository(args, root),
  stdout: args[0] === 'status' ? ' M src/a.ts\n?? notes.md\n' : repository(args, root).stdout,
});

const orphan = {
  id: 'orphan', introducedIn: '4.1.0', requires: [], cancels: [], supersedes: [],
  applicability: { kind: 'always' }, verification: { kind: 'confirm' },
} as const;

function upgrade(patch: Partial<UpgradeOptions> = {}): Promise<number> {
  return runUpgrade(root, {
    log: (line) => void lines.push(line),
    git: repository,
    loadConfig: async () => ({}),
    running: RUNNING,
    exec: () => {},
    handoff: () => 0,
    reconcile: async () => {},
    ...patch,
  });
}

describe('runUpgrade · refusals before any change', () => {
  it('needs the running package version as its only target authority', async () => {
    adopt();

    await expect(upgrade({ running: null })).rejects.toThrow('has no target authority');
  });

  it('needs an adopted application', async () => {
    await expect(upgrade()).rejects.toThrow(`no blueprint.config.mjs was found under ${root}`);
  });

  it('refuses to continue while authoring or a topology transformation is unfinished', async () => {
    adopt();
    write('blueprint-authoring.md', '#\n');
    write('blueprint-transformation.json', '{}');

    await expect(upgrade()).rejects.toThrow(
      'a Blueprint workflow is still in progress (blueprint-authoring.md, '
      + 'blueprint-transformation.json)',
    );
  });

  it('fails closed on unreadable, missing, or unprovable lifecycle facts', async () => {
    adopt('.', '4.1.0');

    await expect(upgrade()).rejects.toThrow('.blueprint-lifecycle.json is missing, but '
      + '@kekkai/blueprint 4.1.0 always records it');

    write('.blueprint-lifecycle.json', '{');
    await expect(upgrade()).rejects.toThrow('.blueprint-lifecycle.json is unreadable');

    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));
    fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
    await expect(upgrade()).rejects.toThrow('@kekkai/blueprint is not installed for .,');
  });

  it('refuses mixed installed versions in one repository', async () => {
    adopt('apps/a', '4.0.0');
    adopt('apps/b', '3.2.0');

    await expect(upgrade()).rejects.toThrow('different installed @kekkai/blueprint versions '
      + '(3.2.0, 4.0.0)');
  });

  it('names the supported checkpoint for a source below the window', async () => {
    adopt('.', '3.1.0');

    const loadConfig = async () => ({ architecture: { module: {}, layers: [] } });

    await expect(upgrade({ loadConfig })).rejects.toThrow(
      'Blueprint 3.1.0 is below the supported upgrade window, which starts at 3.2.0',
    );
  });

  it('never downgrades a recorded lifecycle or a pending upgrade', async () => {
    adopt('.', '4.2.0');
    lifecycle({ blueprint: '4.2.0' });

    await expect(upgrade()).rejects.toThrow('the running @kekkai/blueprint 4.1.0 is older than '
      + 'this repository\'s lifecycle 4.2.0');

    lifecycle({
      blueprint: '4.0.0',
      pending: { from: '4.0.0', to: '4.2.0', migrations: [], operations: [], completed: [] },
    });

    await expect(upgrade()).rejects.toThrow('lifecycle 4.2.0. upgrade never downgrades');
  });

  it('reports a config that cannot be loaded for planning', async () => {
    adopt();

    await expect(upgrade({ loadConfig: async () => Promise.reject(new Error('boom')) }))
      .rejects.toThrow('./blueprint.config.mjs could not be loaded before the upgrade (boom)');

    await expect(upgrade({ loadConfig: async () => Promise.reject('text') }))
      .rejects.toThrow('(text)');
  });

  it('refuses an invalid shipped catalog or an operation without instructions', async () => {
    adopt();

    await expect(upgrade({
      catalog: {
        supportedFrom: '3.2.0', legacyConfigCheckpoint: '3.2.0', migrations: [],
        operations: [orphan, { ...orphan, introducedIn: '9.0.0', id: 'future' }],
      },
    })).rejects.toThrow('ships an invalid upgrade catalog (future-entry:future; '
      + 'missing-instruction:orphan; missing-instruction:future)');
  });

  it('requires a recoverable clean Git worktree to start', async () => {
    adopt();

    await expect(upgrade({ git: () => ({ status: 128, stdout: '', stderr: 'no git' }) }))
      .rejects.toThrow('starting an upgrade requires a Git worktree');

    await expect(upgrade({ git: dirty })).rejects.toThrow('uncommitted: src/a.ts, notes.md');

    expect(lines.join('\n'))
      .toContain('Safety: ✗ starting an upgrade requires a clean Git worktree');

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
  });

  it('shows the Git requirement on a dry run instead of refusing', async () => {
    adopt();

    expect(await upgrade({ dryRun: true, git: () => ({ status: 1, stdout: '', stderr: '' }) }))
      .toBe(0);

    expect(lines.join('\n')).toContain('Safety: ✗ starting an upgrade requires a Git worktree');
  });

  it('needs a manifest that owns the dependency', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    install('4.0.0');

    await expect(upgrade()).rejects.toThrow('no package.json above . declares @kekkai/blueprint');
  });

  it('keeps the pending upgrade when the install does not reach the target', async () => {
    adopt();

    await expect(upgrade()).rejects.toThrow('the project resolves @kekkai/blueprint 4.0.0 instead '
      + 'of 4.1.0. The pending upgrade stays recorded');

    expect(JSON.parse(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8'))
      .pending).toMatchObject({ from: '4.0.0', to: '4.1.0' });

    fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
    await expect(upgrade()).rejects.toThrow('@kekkai/blueprint nowhere instead of 4.1.0');
  });
});

describe('runUpgrade · --complete refusals', () => {
  it('cannot be combined with --dry-run', async () => {
    await expect(upgrade({ complete: 'x', dryRun: true }))
      .rejects.toThrow('--complete records durable progress and cannot be combined with '
        + '--dry-run.');
  });

  it('needs readable state with a pending upgrade that lists the operation', async () => {
    adopt();

    await expect(upgrade({ complete: 'x' }))
      .rejects.toThrow('--complete x needs a pending upgrade');

    write('.blueprint-lifecycle.json', '[');
    await expect(upgrade({ complete: 'x' })).rejects.toThrow('is unreadable');

    lifecycle({});

    await expect(upgrade({ complete: 'x' }))
      .rejects.toThrow('--complete x needs a pending upgrade');

    lifecycle({
      pending: { from: '4.0.0', to: '4.1.0', migrations: [], operations: [], completed: [] },
    });

    await expect(upgrade({ complete: 'x' })).rejects.toThrow('Pending: none.');
  });
});
