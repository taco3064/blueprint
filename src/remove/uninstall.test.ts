import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvenanceRecord } from '../lifecycle';
import type { RemovalApplication, RemovalFacts, RemovalMode } from './facts';
import { plannedFiles } from './references';
import { declared, uninstallPlan } from './uninstall';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-uninstall-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function manifest(
  rel: string,
  devDependencies: string[],
  scripts: Record<string, string> = {},
): void {
  write(path.posix.join(rel, 'package.json'), JSON.stringify({
    scripts,
    devDependencies: Object.fromEntries(devDependencies.map((name) => [name, '*'])),
  }));
}

function application(
  key: string,
  provenance: ProvenanceRecord[],
  owner: string | null = key,
): RemovalApplication {
  fs.mkdirSync(path.join(root, key), { recursive: true });

  return {
    key,
    root: path.join(root, key),
    blueprint: null,
    installed: null,
    manifest: owner === null ? null : { root: path.join(root, owner), section: 'devDependencies' },
    provenance,
  };
}

function facts(
  scope: RemovalApplication[],
  mode: RemovalMode = 'partial',
  remaining: string[] = [],
): RemovalFacts {
  return { root, state: { status: 'missing' }, scope, remaining, mode };
}

const recorded = (...names: string[]): ProvenanceRecord[] =>
  names.map((name) => ({ kind: 'dependency', name }));

describe('uninstallPlan', () => {
  it('uninstalls recorded carriers nothing references and explains every carrier it keeps', () => {
    manifest('.', [
      '@kekkai/blueprint', 'eslint', 'typescript-eslint', 'eslint-plugin-import-x',
      '@stylistic/eslint-plugin', 'react',
    ], { lint: 'tsc && eslint-plugin-import-x --check' });

    write('eslint.config.js', 'import tseslint from \'typescript-eslint\';\n');
    write('pnpm-lock.yaml', '');

    const plan = uninstallPlan(facts([application('.', [
      ...recorded('eslint', 'typescript-eslint', 'eslint-plugin-import-x'),
      {
        kind: 'script', path: 'package.json', name: '@stylistic/eslint-plugin', before: null,
        after: 'x',
      },
    ])]), plannedFiles([]));

    expect(plan).toEqual({
      steps: [{
        manifest: '.',
        root,
        packageManager: 'pnpm',
        names: ['@kekkai/blueprint', 'eslint'],
        command: 'pnpm remove @kekkai/blueprint eslint',
      }],
      residues: [
        { kind: 'dependency-kept', name: 'typescript-eslint', manifest: '.', reason: 'referenced' },
        {
          kind: 'dependency-kept',
          name: 'eslint-plugin-import-x',
          manifest: '.',
          reason: 'referenced',
        },
        {
          kind: 'dependency-kept',
          name: '@stylistic/eslint-plugin',
          manifest: '.',
          reason: 'unrecorded',
        },
      ],
    });
  });

  it('ignores references that planned rewrites and deletions remove', () => {
    manifest('.', ['@kekkai/blueprint', 'typescript-eslint'], { lint: 'typescript-eslint src' });
    write('eslint.config.js', 'import tseslint from "typescript-eslint/parser";\n');

    const planned = plannedFiles([
      { kind: 'write', path: 'package.json', content: '{"scripts":{}}', reason: 'script' },
      { kind: 'delete', path: 'eslint.config.js', reason: 'generated' },
    ]);

    const plan = uninstallPlan(facts([application('.', recorded('typescript-eslint'))]), planned);

    expect(plan.steps[0].command).toBe('npm uninstall @kekkai/blueprint typescript-eslint');
    expect(plan.residues).toEqual([]);
  });

  it('keeps unrecorded carriers silently when records are complete', () => {
    manifest('.', ['@kekkai/blueprint', 'eslint']);

    expect(uninstallPlan(facts([application('.', [])], 'provenance'), plannedFiles([])).residues)
      .toEqual([]);
  });

  it('reads records per manifest and keeps a manifest that remaining applications share', () => {
    manifest('apps/web', ['@kekkai/blueprint', 'eslint']);
    manifest('apps/admin', ['@kekkai/blueprint', 'eslint']);
    manifest('.', ['@kekkai/blueprint']);

    const plan = uninstallPlan(facts([
      application('apps/web', recorded('eslint')),
      application('apps/admin', []),
      application('apps/docs', recorded('eslint'), '.'),
      application('apps/tools', [], null),
    ], 'partial', ['apps/site']), plannedFiles([]));

    expect(plan).toEqual({
      steps: [
        {
          manifest: 'apps/web',
          root: path.join(root, 'apps/web'),
          packageManager: 'npm',
          names: ['@kekkai/blueprint', 'eslint'],
          command: 'npm uninstall @kekkai/blueprint eslint',
        },
        {
          manifest: 'apps/admin',
          root: path.join(root, 'apps/admin'),
          packageManager: 'npm',
          names: ['@kekkai/blueprint'],
          command: 'npm uninstall @kekkai/blueprint',
        },
      ],
      residues: [
        { kind: 'dependency-kept', name: 'eslint', manifest: 'apps/admin', reason: 'unrecorded' },
        {
          kind: 'dependency-kept', name: '@kekkai/blueprint', manifest: '.', reason: 'shared',
        },
      ],
    });
  });

  it('declares nothing for a missing or unreadable manifest', () => {
    expect(declared(root)).toEqual([]);
    write('package.json', '{ broken');
    expect(declared(root)).toEqual([]);
  });
});
