import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withPlanIdentity } from '../lifecycle';
import type { UpgradeCatalog, UpgradeOperation } from '../lifecycle';
import type { OperationalText } from '../operational-contract';
import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-resume-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const BACKUP = `blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`;

function op(id: string, introducedIn: string, extra: Partial<UpgradeOperation> = {}) {
  return {
    id, introducedIn, requires: [], cancels: [], supersedes: [],
    applicability: { kind: 'always' }, verification: { kind: 'confirm' }, ...extra,
  } as UpgradeOperation;
}

const CATALOG: UpgradeCatalog = {
  supportedFrom: '3.2.0',
  legacyConfigCheckpoint: '3.2.0',
  migrations: [],
  operations: [
    op('confirm-first', '4.0.0'),
    op('clean-backups', '4.1.0', {
      verification: { kind: 'no-files', pattern: 'blueprint.config.mjs.pre-v4-*' },
    }),
  ],
};

function adopt(): void {
  for (const app of ['apps/web', 'apps/admin']) {
    write(`${app}/blueprint.config.mjs`, 'export default {};\n');

    write(`${app}/node_modules/@kekkai/blueprint/package.json`, JSON.stringify({
      name: '@kekkai/blueprint', version: '4.1.0',
    }));
  }

  write('package.json', '{}');

  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, blueprint: '3.2.0', provenance: 'complete', operations: [],
    pending: withPlanIdentity({
      from: '3.2.0', to: '4.1.0', migrations: [], completed: [],
      operations: [
        { id: 'confirm-first', applications: ['apps/web'], evidence: {}, supersedes: [] },
        { id: 'clean-backups', applications: ['apps/admin'], evidence: {}, supersedes: [] },
      ],
    }),
    applications: {},
  }));
}

const state = () => JSON.parse(
  fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8'),
);

const outsideGit: GitReader = () => ({ status: 128, stdout: '', stderr: 'not a git repository' });

function upgrade(patch: Partial<UpgradeOptions> = {}): Promise<number> {
  return runUpgrade(root, {
    log: (line) => void lines.push(line),
    git: outsideGit,
    loadConfig: async () => ({}),
    running: { root: '/runner', version: '4.1.0' },
    catalog: CATALOG,
    instruction: (id) => `Do ${id}.` as OperationalText,
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

describe('runUpgrade · resuming outside a clean worktree', () => {
  it('plans each pending operation with its own release and does not ask for Git', async () => {
    adopt();

    expect(await upgrade({ dryRun: true })).toBe(0);

    expect(lines.join('\n').split('\n')).toEqual(expect.arrayContaining([
      '    1. confirm-first (4.0.0) → `apps/web`',
      '    2. clean-backups (4.1.0) → `apps/admin`',
      '  Safety: resuming the recorded pending upgrade; uncommitted upgrade work is expected',
    ]));
  });

  it('continues without rewriting the recorded plan', async () => {
    adopt();

    const before = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8');

    expect(await upgrade()).toBe(1);
    expect(lines.join('\n')).not.toContain('✓ write: .blueprint-lifecycle.json');
    expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8')).toBe(before);

    const dirty: GitReader = (args) => ({
      status: 0,
      stdout: args[0] === 'status' ? ' M blueprint-upgrade.md\n' : root,
      stderr: '',
    });

    expect(await upgrade({ git: dirty })).toBe(1);
  });

  it('verifies an operation in the applications it lists', async () => {
    adopt();
    write(`apps/admin/${BACKUP}`, 'export default {};\n');
    write(`apps/web/${BACKUP}`, 'export default {};\n');

    await expect(upgrade({ complete: 'clean-backups' }))
      .rejects.toThrow(`apps/admin/${BACKUP}`);

    fs.rmSync(path.join(root, 'apps/admin', BACKUP));

    expect(await upgrade({ complete: 'clean-backups' })).toBe(0);
    expect(state().pending.completed).toEqual(['clean-backups']);
  });

  it('keeps ownership records that reconciliation added when it records completion', async () => {
    adopt();
    await upgrade({ complete: 'confirm-first' });
    await upgrade({ complete: 'clean-backups' });

    const applications = { 'apps/web': { provenance: [{ kind: 'directory', path: 'src' }] } };

    const reconcile = async () => {
      write('.blueprint-lifecycle.json', JSON.stringify({ ...state(), applications }));
    };

    expect(await upgrade({ reconcile })).toBe(0);

    expect(state()).toEqual({
      schema: 1,
      blueprint: '4.1.0',
      provenance: 'complete',
      operations: ['confirm-first', 'clean-backups'],
      pending: null,
      applications,
    });
  });

  it.each([
    ['omits an operation', (pending: Record<string, unknown[]>) => ({
      ...pending, operations: pending.operations.slice(0, 1),
    })],
    ['moves an operation to another application', (pending: Record<string, unknown[]>) => ({
      ...pending,
      operations: [
        pending.operations[0],
        { ...pending.operations[1] as object, applications: ['.'] },
      ],
    })],
    ['rewrites supersession history', (pending: Record<string, unknown[]>) => ({
      ...pending,
      operations: [
        pending.operations[0],
        {
          ...pending.operations[1] as object,
          supersedes: [{ id: 'confirm-first', completed: true }],
        },
      ],
    })],
  ])('refuses to resume a recorded plan that %s between runs', async (_, tamper) => {
    adopt();

    const recorded = state();

    write('.blueprint-lifecycle.json', JSON.stringify({
      ...recorded, pending: tamper(recorded.pending),
    }));

    for (const run of [() => upgrade(), () => upgrade({ complete: 'confirm-first' })]) {
      await expect(run())
        .rejects.toThrow('.blueprint-lifecycle.json is unreadable: its `pending` field is invalid');
    }
  });

  it('refuses to complete an operation without any lifecycle state', async () => {
    write('blueprint.config.mjs', 'export default {};\n');

    await expect(upgrade({ complete: 'clean-backups' }))
      .rejects.toThrow('--complete clean-backups needs a pending upgrade');
  });
});
