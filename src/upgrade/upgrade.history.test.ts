import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { UpgradeCatalog, UpgradeOperation } from '../lifecycle';
import type { OperationalText } from '../operational-contract';
import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-history-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function install(version: string): void {
  write('node_modules/@kekkai/blueprint/package.json',
    JSON.stringify({ name: '@kekkai/blueprint', version }));
}

function adopt(installed: string, recorded: { blueprint: string; operations: string[] }): void {
  write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': installed } }));
  write('blueprint.config.mjs', 'export default {};\n');
  install(installed);

  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, provenance: 'complete', pending: null, applications: {}, ...recorded,
  }));
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

function op(id: string, introducedIn: string, supersedes: string[] = []): UpgradeOperation {
  return {
    id, introducedIn, requires: [], cancels: [], supersedes,
    applicability: { kind: 'always' }, verification: { kind: 'confirm' },
  };
}

function upgrade(
  catalog: UpgradeCatalog,
  running: string,
  patch: Partial<UpgradeOptions> = {},
): Promise<number> {
  return runUpgrade(root, {
    log: (line) => void lines.push(line),
    git,
    loadConfig: async () => ({}),
    catalog,
    instruction: (id) => `Do ${id}.` as OperationalText,
    running: { root: '/runner', version: running },
    exec: () => install(running),
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

describe('runUpgrade · re-planning for a newer release', () => {
  const release: UpgradeCatalog = {
    supportedFrom: '3.2.0', legacyConfigCheckpoint: '3.2.0', migrations: [], retired: [],
    operations: [op('first-step', '4.1.0')],
  };

  const catalog: UpgradeCatalog = {
    ...release, operations: [...release.operations, op('second-step', '4.2.0')],
  };

  it('resumes the re-planned upgrade in a later run without repeating completed work', async () => {
    adopt('4.0.0', { blueprint: '4.0.0', operations: [] });

    expect(await upgrade(release, '4.1.0')).toBe(0);
    expect(await upgrade(release, '4.1.0')).toBe(1);
    expect(await upgrade(release, '4.1.0', { complete: 'first-step' })).toBe(0);
    expect(await upgrade(catalog, '4.2.0')).toBe(0);

    expect(state().pending).toMatchObject({
      from: '4.0.0',
      to: '4.2.0',
      completed: ['first-step'],
      operations: [{ id: 'first-step' }, { id: 'second-step' }],
    });

    lines = [];
    expect(await upgrade(catalog, '4.2.0')).toBe(1);
    expect(output()).toContain('Blueprint upgrade — resuming the pending upgrade');
    expect(playbook()).toContain('`first-step` — introduced in 4.1.0 — done — do not repeat');
    expect(playbook()).toContain('`second-step` — introduced in 4.2.0 — pending');

    await expect(upgrade(catalog, '4.2.0', { complete: 'first-step' }))
      .rejects.toThrow('first-step is not a pending semantic operation of this upgrade. '
        + 'Pending: second-step.');

    expect(await upgrade(catalog, '4.2.0', { complete: 'second-step' })).toBe(0);
    expect(await upgrade(catalog, '4.2.0')).toBe(0);

    expect(state()).toMatchObject({
      blueprint: '4.2.0', operations: ['first-step', 'second-step'], pending: null,
    });
  });
});

describe('runUpgrade · supersession after the supported window moves', () => {
  const RETIRED = 'review-retired-module-private';

  const catalog: UpgradeCatalog = {
    supportedFrom: '4.1.0', legacyConfigCheckpoint: '3.2.0', migrations: [],
    operations: [op('converge', '4.2.0', [RETIRED])],
    retired: [{ id: RETIRED, introducedIn: '4.0.0' }],
  };

  it.each([
    [[RETIRED], true, `Replaces \`${RETIRED}\`, which already ran in this repository`],
    [[], false, `Replaces \`${RETIRED}\`, which never ran here: do not perform it.`],
  ])('records history %j of a retired operation an active one supersedes', async (
    operations,
    completed,
    guidance,
  ) => {
    adopt('4.2.0', { blueprint: '4.1.0', operations });

    expect(await upgrade(catalog, '4.2.0')).toBe(1);

    expect(state().pending.operations).toEqual([{
      id: 'converge', applications: ['.'], evidence: {}, supersedes: [{ id: RETIRED, completed }],
    }]);

    expect(playbook()).toContain(guidance);

    lines = [];
    expect(await upgrade(catalog, '4.2.0')).toBe(1);
    expect(output()).toContain('Blueprint upgrade — resuming the pending upgrade');
  });
});
