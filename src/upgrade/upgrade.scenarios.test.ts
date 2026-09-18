import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpgradeCatalog, UpgradeOperation } from '../lifecycle';
import type { OperationalText } from '../operational-contract';
import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-scenario-')));
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

function adopt(declared: string, installed = declared): void {
  write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': declared } }));
  write('blueprint.config.mjs', 'export default {};\n');
  install(installed);
}

function adoptApplications(apps: string[]): void {
  for (const app of apps) {
    write(`${app}/package.json`, '{}');
    write(`${app}/blueprint.config.mjs`, 'export default {};\n');
  }
}

const git: GitReader = (args) => ({
  status: 0,
  stdout: args[0] === 'status' ? '' : args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

const state = () => JSON.parse(
  fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8'),
);

const output = () => lines.join('\n');
const playbook = () => fs.readFileSync(path.join(root, 'blueprint-upgrade.md'), 'utf-8');

function op(
  id: string,
  introducedIn: string,
  extra: Partial<UpgradeOperation> = {},
): UpgradeOperation {
  return {
    id, introducedIn, requires: [], cancels: [], supersedes: [],
    applicability: { kind: 'always' }, verification: { kind: 'confirm' }, ...extra,
  };
}

function upgrade(patch: Partial<UpgradeOptions> = {}): Promise<number> {
  return runUpgrade(root, {
    log: (line) => void lines.push(line),
    git,
    loadConfig: async () => ({}),
    running: { root: '/runner', version: '4.1.0' },
    exec: () => {},
    handoff: () => 0,
    reconcile: async () => {},
    verify: async (_root, application) => ({
      application,
      inspect: { ok: true, findings: 0 },
      doctor: { verdict: 'complete', failed: [], skipped: [] },
    }),
    ...patch,
  });
}

describe('runUpgrade · repository scope', () => {
  it('upgrades every adopted application and groups installs by manifest owner', async () => {
    write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': '^4.0.0' } }));
    write('pnpm-lock.yaml', '');
    adoptApplications(['apps/admin', 'apps/web']);
    install('4.0.0');

    const exec = vi.fn(() => install('4.1.0'));

    expect(await upgrade({ exec })).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('pnpm add -D @kekkai/blueprint@4.1.0', root);

    expect(output()).toContain('Applications: `apps/admin` (installed 4.0.0), '
      + '`apps/web` (installed 4.0.0)');

    const reconcile = vi.fn(async (_app: string) => {});

    const verify = vi.fn(async (_root: string, application: string) => ({
      application,
      inspect: { ok: true, findings: 0 },
      doctor: {
        verdict: application === 'apps/web' ? 'unverified' as const : 'complete' as const,
        failed: [],
        skipped: [],
      },
    }));

    expect(await upgrade({ reconcile, verify })).toBe(1);

    expect(reconcile.mock.calls.map(([app]) => app))
      .toEqual([path.join(root, 'apps/admin'), path.join(root, 'apps/web')]);

    expect(output())
      .toContain('✗ doctor unverified in `apps/web` — run `npx blueprint doctor` there');

    expect(state().pending).not.toBeNull();
  });

  it('uses yarn and keeps a production dependency section', async () => {
    write('package.json', JSON.stringify({ dependencies: { '@kekkai/blueprint': '4.0.0' } }));
    write('yarn.lock', '');
    write('blueprint.config.mjs', 'export default {};\n');
    install('4.0.0');

    const runner = path.join(root, 'my runner');

    write('my runner/package-lock.json', JSON.stringify({
      packages: { 'node_modules/@kekkai/blueprint': { resolved: 'file:candidate.tgz' } },
    }));

    const running = { root: path.join(runner, 'node_modules/@kekkai/blueprint'), version: '4.1.0' };
    const tarball = `"${path.join(runner, 'candidate.tgz')}"`;

    expect(await upgrade({ dryRun: true, running })).toBe(0);
    expect(output()).toContain(`\`yarn add ${tarball}\``);

    lines = [];
    expect(await upgrade({ dryRun: true })).toBe(0);
    expect(output()).toContain('`yarn add @kekkai/blueprint@4.1.0`');
  });
});

describe('runUpgrade · lifecycle checkpoints', () => {
  it('establishes lifecycle state for a pre-lifecycle repository already on the running '
    + 'release', async () => {
    adopt('4.0.0');

    expect(await upgrade({ running: { root: '/runner', version: '4.0.0' } })).toBe(0);

    expect(output())
      .toContain('Source: 4.0.0 (installed @kekkai/blueprint; no lifecycle state yet');

    expect(output())
      .toContain('Dependency: every adopted application already has @kekkai/blueprint 4.0.0');

    expect(output()).toContain('Semantic operations for the coding Agent: none');
    expect(state()).toMatchObject({ blueprint: '4.0.0', provenance: 'partial', pending: null });
  });

  it('refuses to finish when the lifecycle state changed under the upgrade', async () => {
    adopt('4.0.0');

    const reconcile = async () => fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

    await expect(upgrade({ reconcile, running: { root: '/runner', version: '4.0.0' } }))
      .rejects.toThrow('.blueprint-lifecycle.json changed while this upgrade was running (it is '
        + 'gone)');

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);

    const corrupt = async () => write('.blueprint-lifecycle.json', '{');

    await expect(upgrade({ reconcile: corrupt, running: { root: '/runner', version: '4.0.0' } }))
      .rejects.toThrow('changed while this upgrade was running (it is unreadable: json)');

    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

    const rewrite = async () => write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '4.0.0', provenance: 'partial', operations: [], pending: null,
      applications: {},
    }));

    await expect(upgrade({ reconcile: rewrite, running: { root: '/runner', version: '4.0.0' } }))
      .rejects.toThrow('it no longer records the pending upgrade 4.0.0 → 4.0.0');

    expect(state()).toMatchObject({ blueprint: '4.0.0', pending: null });
  });

  it('names catalog problems that do not belong to one operation', async () => {
    adopt('4.0.0');

    await expect(upgrade({
      catalog: {
        supportedFrom: '9.0.0', legacyConfigCheckpoint: '3.2.0', migrations: [], operations: [],
      },
    })).rejects.toThrow('(window-beyond-package)');
  });

  it('re-plans a pending upgrade for a newer running release without losing completed '
    + 'work', async () => {
    adopt('4.1.0', '4.2.0');

    const catalog: UpgradeCatalog = {
      supportedFrom: '3.2.0',
      legacyConfigCheckpoint: '3.2.0',
      migrations: [],
      operations: [op('first-step', '4.1.0'), op('second-step', '4.2.0')],
    };

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '4.0.0', provenance: 'complete', operations: [],
      pending: {
        from: '4.0.0', to: '4.1.0', migrations: [], completed: ['first-step'],
        operations: [{ id: 'first-step', applications: ['.'], evidence: {}, supersedes: [] }],
      },
      applications: {},
    }));

    const instruction = (id: string) => `Do ${id}.` as OperationalText;

    expect(await upgrade({ catalog, instruction, running: { root: '/runner', version: '4.2.0' } }))
      .toBe(1);

    expect(output()).toContain('Blueprint upgrade — plan');

    expect(state().pending)
      .toMatchObject({ from: '4.0.0', to: '4.2.0', completed: ['first-step'] });

    expect(state().pending.operations.map((entry: { id: string }) => entry.id))
      .toEqual(['second-step']);
  });
});

describe('runUpgrade · one composed playbook for a multi-release jump', () => {
  it('removes canceled and superseded history before the Agent sees anything', async () => {
    adopt('4.1.0');

    const catalog: UpgradeCatalog = {
      supportedFrom: '3.2.0',
      legacyConfigCheckpoint: '3.2.0',
      migrations: [],
      operations: [
        op('rename-hooks', '3.3.0'),
        op('temporary-shim', '4.0.0'),
        op('legacy-only', '4.0.0', { applicability: { kind: 'legacy-config-shape' } }),
        op('rename-composables', '4.1.0', {
          supersedes: ['rename-hooks'], cancels: ['temporary-shim'],
        }),
      ],
    };

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '3.2.0', provenance: 'complete', operations: [], pending: null,
      applications: {},
    }));

    const instruction = (id: string) => `Instruction for ${id}.` as OperationalText;

    expect(await upgrade({ dryRun: true, catalog, instruction })).toBe(0);

    expect(output())
      .toContain('Removed from the plan: rename-hooks — superseded by rename-composables');

    expect(output())
      .toContain('Removed from the plan: temporary-shim — canceled by rename-composables');

    expect(output()).toContain('Not applicable here: legacy-only');

    lines = [];
    expect(await upgrade({ catalog, instruction })).toBe(1);
    expect(playbook()).toContain('Instruction for rename-composables.');

    expect(playbook())
      .toContain('Replaces `rename-hooks`, which never ran here: do not perform it.');

    expect(playbook()).not.toContain('Instruction for rename-hooks.');
    expect(playbook()).not.toContain('Instruction for temporary-shim.');
    expect(playbook()).toContain('Blueprint cannot measure this operation');
  });
});
