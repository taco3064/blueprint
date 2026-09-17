import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LifecycleState } from '../lifecycle';
import type { GitReader } from '../project';
import type { RemovalApplication, RemovalFacts } from './facts';
import { planRemoval } from './plan';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-plan-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function application(key: string): RemovalApplication {
  fs.mkdirSync(path.join(root, key), { recursive: true });

  return {
    key,
    root: path.join(root, key),
    blueprint: null,
    installed: null,
    manifest: null,
    provenance: [],
  };
}

const STATE: LifecycleState = {
  schema: 1,
  blueprint: '4.1.0',
  provenance: 'complete',
  operations: [],
  pending: null,
  applications: { 'apps/admin': { provenance: [] }, 'apps/web': { provenance: [] } },
};

function facts(patch: Partial<RemovalFacts>): RemovalFacts {
  return {
    root,
    state: { status: 'present', state: STATE },
    scope: [application('apps/web')],
    remaining: [],
    mode: 'provenance',
    ...patch,
  };
}

const quiet: GitReader = () => ({ status: 0, stdout: '', stderr: '' });

describe('planRemoval · lifecycle artifacts', () => {
  it('deletes the playbook and the lifecycle state when nothing stays adopted', () => {
    write('blueprint-upgrade.md');

    expect(planRemoval(facts({}), quiet).actions).toEqual([
      { kind: 'delete', path: 'blueprint-upgrade.md', reason: 'workflow' },
      { kind: 'delete', path: '.blueprint-lifecycle.json', reason: 'lifecycle-state' },
    ]);

    fs.rmSync(path.join(root, 'blueprint-upgrade.md'));

    expect(planRemoval(facts({}), quiet).actions).toEqual([
      { kind: 'delete', path: '.blueprint-lifecycle.json', reason: 'lifecycle-state' },
    ]);
  });

  it('keeps the playbook and rewrites the state for applications that stay adopted', () => {
    write('blueprint-upgrade.md');

    expect(planRemoval(facts({ remaining: ['apps/admin'] }), quiet).actions).toEqual([{
      kind: 'write',
      path: '.blueprint-lifecycle.json',
      content: `${JSON.stringify({
        ...STATE, applications: { 'apps/admin': { provenance: [] } },
      }, null, 2)}\n`,
      reason: 'lifecycle-state',
    }]);
  });

  it('plans no lifecycle action without a readable state file', () => {
    write('blueprint-upgrade.md');

    expect(planRemoval(facts({ state: { status: 'missing' }, mode: 'legacy' }), quiet).actions)
      .toEqual([{ kind: 'delete', path: 'blueprint-upgrade.md', reason: 'workflow' }]);

    fs.rmSync(path.join(root, 'blueprint-upgrade.md'));

    expect(planRemoval(facts({ state: { status: 'missing' }, mode: 'legacy' }), quiet).actions)
      .toEqual([]);
  });
});

describe('planRemoval · retained transformation origins', () => {
  const refFor = (key: string) =>
    `refs/blueprint/transformations/${createHash('sha256').update(key).digest('hex')}`;

  it('deletes only the refs Git lists for each application in scope', () => {
    const asked: string[] = [];

    const git: GitReader = (args, cwd) => {
      asked.push(`${args.join(' ')} @ ${cwd}`);

      return {
        status: 0,
        stdout: args[2] === refFor('') || args[2] === refFor('apps/web') ? `x\n${args[2]}\n` : '',
        stderr: '',
      };
    };

    const plan = planRemoval(facts({
      state: { status: 'missing' },
      scope: [application('.'), application('apps/web'), application('apps/admin')],
    }), git);

    expect(plan.actions).toEqual([
      { kind: 'ref', ref: refFor(''), application: '.' },
      { kind: 'ref', ref: refFor('apps/web'), application: 'apps/web' },
    ]);

    expect(asked).toEqual(['', 'apps/web', 'apps/admin'].map((key) =>
      `for-each-ref --format=%(refname) ${refFor(key)} @ ${root}`));
  });
});
