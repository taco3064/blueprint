import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { cli, configSource, makeRepo, reactBlueprint, read, rm, write } from './conformance';

// Renovate, Dependabot, or `npm update` moves a 4.0 adoption's package to 4.1 before
// `blueprint upgrade` runs, so lifecycle state never existed in Git. Refusing to "restore"
// it locked every lifecycle command out of the repository.

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

function git(root: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

function commit(root: string, message: string): void {
  git(root, 'add', '.');

  git(
    root,
    '-c',
    'user.name=Blueprint Test',
    '-c',
    'user.email=blueprint@example.invalid',
    'commit',
    '--quiet',
    '-m',
    message,
  );
}

function updatedAdoption(): string {
  const root = makeRepo({
    packageJson: {
      name: 'updated',
      dependencies: { react: '^18.0.0' },
      devDependencies: { '@kekkai/blueprint': '^4.0.0' },
    },
    files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
  });

  roots.push(root);
  git(root, 'init', '--quiet');
  commit(root, 'adopt Blueprint 4.0');

  write(root, 'node_modules/@kekkai/blueprint/package.json', JSON.stringify({
    name: '@kekkai/blueprint', version: '4.1.0',
  }));

  return root;
}

it('lets init date the lifecycle from its package when state never entered Git', async () => {
  const root = updatedAdoption();
  const result = await cli(root, ['init', '--no-install']);

  expect(result.output).not.toContain('always writes it');

  expect(JSON.parse(read(root, '.blueprint-lifecycle.json')!))
    .toMatchObject({ blueprint: '4.1.0', provenance: 'partial' });
});

it('lets remove plan a pre-lifecycle removal when state never entered Git', async () => {
  const root = updatedAdoption();
  const result = await cli(root, ['remove', '--dry-run']);

  expect(result.output).not.toContain('always records it');

  expect(result.output).toContain('no lifecycle records, so only name- or content-proven '
    + 'Blueprint artifacts are removed');
});

it('still refuses both when state once entered Git history and is now missing', async () => {
  const root = updatedAdoption();

  write(root, '.blueprint-lifecycle.json', '{}\n');
  commit(root, 'record lifecycle state');
  fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

  const init = await cli(root, ['init', '--no-install']);

  expect(init.code).not.toBe(0);

  expect(init.output).toContain('.blueprint-lifecycle.json is missing, and @kekkai/blueprint 4.1.0 '
    + 'always writes it');

  const remove = await cli(root, ['remove', '--dry-run']);

  expect(remove.code).not.toBe(0);

  expect(remove.output).toContain('.blueprint-lifecycle.json is missing, but @kekkai/blueprint '
    + '4.1.0 always records it');

  expect(read(root, '.blueprint-lifecycle.json')).toBeNull();
});
