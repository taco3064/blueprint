import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { run } from '../cli';
import { reactPreset } from '../presets';
import { buildConfigSource } from '../project';
import { makeRepo, read, rm } from './conformance';

let root: string | null = null;

afterEach(() => {
  if (root) {
    rm(root);
    root = null;
  }
});

function commit(repository: string): void {
  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    ['-c', 'user.name=Blueprint Test', '-c', 'user.email=blueprint@example.invalid',
      'commit', '--quiet', '-m', 'checkpoint'],
  ]) {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf-8' });

    expect(result.status, result.stderr).toBe(0);
  }
}

async function cli(application: string, args: string[]) {
  const output: string[] = [];
  const previous = console.log;

  console.log = (message?: unknown) => void output.push(String(message));

  try {
    return { code: await run(args, application), output: output.join('\n') };
  } finally {
    console.log = previous;
  }
}

function fixture(): { repository: string; web: string; admin: string } {
  const repository = makeRepo({
    packageJson: { name: 'workspace', private: true, workspaces: ['apps/*'] },
    files: {
      '.gitignore': 'node_modules/\n',
      'package-lock.json': '{}',
      'apps/web/package.json': '{"name":"web","dependencies":{"react":"^18"}}',
      'apps/web/package-lock.json': '{}',
      'apps/web/src/main.ts': 'export const web = 1;\n',
      'apps/web/blueprint.config.mjs': buildConfigSource('react', 'web'),
      'apps/admin/package.json': '{"name":"admin","dependencies":{"react":"^18"}}',
      'apps/admin/package-lock.json': '{}',
      'apps/admin/src/main.ts': 'export const admin = 1;\n',
      'apps/admin/blueprint.config.mjs': 'export default { framework: \'react\', '
        + 'architecture: { alias: \'~app\', module: { layout: \'folder\' }, '
        + 'layers: [{ name: \'pages\', does: \'routes\' }] } };\n',
    },
  });

  root = repository;
  commit(repository);

  const packageRoot = path.join(repository, 'node_modules/@kekkai/blueprint');

  fs.mkdirSync(packageRoot, { recursive: true });

  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ type: 'module', exports: './index.mjs' }),
  );

  fs.writeFileSync(
    path.join(packageRoot, 'index.mjs'),
    `export const reactPreset = () => (${JSON.stringify(reactPreset({ name: 'web' }))});\n`,
  );

  return {
    repository,
    web: path.join(repository, 'apps/web'),
    admin: path.join(repository, 'apps/admin'),
  };
}

it('keeps a pristine 4.0 app selected across the sibling checkpoint', async () => {
  const { repository, web, admin } = fixture();
  const phaseOne = await cli(web, ['init', '--topology', 'module-first', '--no-install']);

  expect(phaseOne.code, phaseOne.output).toBe(0);
  expect(phaseOne.output).toContain('Blueprint 3.2 phase 1');
  expect(read(admin, 'blueprint.config.mjs')).not.toContain('"module"');
  expect(read(repository, 'blueprint-authoring.md')).toBeNull();

  commit(repository);

  const phaseTwo = await cli(web, ['init', '--topology', 'module-first', '--no-install']);

  expect(phaseTwo.code, phaseTwo.output).toBe(0);

  expect(read(repository, 'blueprint-authoring.md')).toContain(
    'Phase 1 — prove the 4.0 layer-first state before movement',
  );
});
