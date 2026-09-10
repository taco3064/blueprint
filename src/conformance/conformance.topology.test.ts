import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../cli';
import { makeRepo, read, rm } from './conformance';

const dirs: string[] = [];

function repo(files: Record<string, string> = {}): string {
  const dir = makeRepo({
    packageJson: { name: 'topology', dependencies: { react: '^18' } },
    files,
  });

  dirs.push(dir);

  return dir;
}

async function rawCli(dir: string, args: string[]) {
  const output: string[] = [];
  const log = console.log;
  const error = console.error;

  console.log = (message?: unknown) => void output.push(String(message));
  console.error = (message?: unknown) => void output.push(String(message));

  try {
    return { code: await run(args, dir), output: output.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

function git(dir: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });

  expect(result.status, result.stderr).toBe(0);

  return result.stdout.trim();
}

function commit(dir: string): void {
  git(dir, 'init', '--quiet');
  git(dir, 'add', '.');

  git(
    dir,
    '-c',
    'user.name=Blueprint Test',
    '-c',
    'user.email=blueprint@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'baseline',
  );
}

function tree(dir: string, current = dir): Record<string, string> {
  const files: Record<string, string> = {};

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue;
    }

    const target = path.join(current, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, tree(dir, target));
    } else {
      files[path.relative(dir, target)] = fs.readFileSync(target).toString('base64');
    }
  }

  return files;
}

function repositoryState(dir: string) {
  return {
    files: tree(dir),
    status: git(dir, 'status', '--porcelain=v1', '--untracked-files=all'),
    head: git(dir, 'rev-parse', 'HEAD'),
  };
}

async function expectZeroWriteFailure(dir: string, args: string[], message: RegExp) {
  commit(dir);
  const before = repositoryState(dir);
  const result = await rawCli(dir, args);

  expect(result.code).toBe(1);
  expect(result.output).toMatch(message);
  expect(repositoryState(dir)).toEqual(before);
}

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('init topology · public syntax and zero-write failures', () => {
  it.each([
    [['init', '--topology'], /layer-first \| module-first/],
    [['init', '--topology', 'sideways'], /layer-first \| module-first/],
    [[
      'init', '--topology', 'layer-first', '--topology', 'module-first',
    ], /conflicting/],
  ] as [string[], RegExp][])('rejects invalid topology syntax for %#', async (args, message) => {
    await expectZeroWriteFailure(repo(), args, message);
  });

  it('requires a topology for an empty repository', async () => {
    await expectZeroWriteFailure(repo(), ['init', '--no-install'], /Cannot determine/);
  });

  it('rejects mixed evidence and both unavailable transformation directions', async () => {
    const mixed = repo({
      'src/pages/Home.tsx': 'export const Home = 1;\n',
      'src/components/Button.tsx': 'export const Button = 1;\n',
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    const layerFirst = repo({
      'src/pages/Home.tsx': 'export const Home = 1;\n',
      'src/components/Button.tsx': 'export const Button = 1;\n',
    });

    const moduleFirst = repo({
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    await expectZeroWriteFailure(
      mixed,
      ['init', '--topology', 'layer-first', '--no-install'],
      /topology transformation.*not delivered/s,
    );

    await expectZeroWriteFailure(
      layerFirst,
      ['init', '--topology', 'module-first', '--no-install'],
      /layer-first to module-first.*No files were changed/s,
    );

    await expectZeroWriteFailure(
      moduleFirst,
      ['init', '--topology', 'layer-first', '--no-install'],
      /module-first to layer-first.*No files were changed/s,
    );
  });
});

describe('init topology · initialization and conservative adoption', () => {
  it('initializes both explicit empty-project targets through their correct flows', async () => {
    const layerFirst = repo();
    const moduleFirst = repo();

    expect((await rawCli(layerFirst, [
      'init', '--topology', 'layer-first', '--no-install',
    ])).code).toBe(0);

    expect(read(layerFirst, 'blueprint.config.mjs')).toContain('reactPreset');

    const moduleResult = await rawCli(moduleFirst, [
      'init', '--topology', 'module-first', '--no-install',
    ]);

    expect(moduleResult.code).toBe(0);
    expect(moduleResult.output).not.toContain('brownfield without a config');
    expect(moduleResult.output).not.toContain('Prefer a preset scaffold');
    expect(moduleResult.output).not.toContain('init --preset --topology layer-first');

    expect(read(moduleFirst, 'blueprint-authoring.md')).toContain('authoring playbook');
    expect(read(moduleFirst, 'blueprint-authoring.md')).toContain('module-first was selected');
    expect(read(moduleFirst, 'blueprint-authoring.md')).not.toContain('early-exit checklist');
    expect(read(moduleFirst, 'blueprint.config.mjs')).toBeNull();
  });

  it('adopts clear layer-first and module-first trees without a flag', async () => {
    const layerFirst = repo({
      'src/pages/Home.tsx': 'export const Home = 1;\n',
      'src/components/Button.tsx': 'export const Button = 1;\n',
    });

    const moduleFirst = repo({
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    expect((await rawCli(layerFirst, ['init', '--no-install'])).code).toBe(0);
    expect(read(layerFirst, 'blueprint.config.mjs')).toContain('reactPreset');

    expect((await rawCli(moduleFirst, ['init', '--no-install'])).code).toBe(0);
    expect(read(moduleFirst, 'blueprint-authoring.md')).toContain('authoring playbook');
    expect(read(moduleFirst, 'blueprint.config.mjs')).toBeNull();
  });

  it('accepts an explicit topology for insufficient evidence without claiming classification',
    async () => {
      const dir = repo({ 'src/app/file.ts': 'export const value = 1;\n' });

      const result = await rawCli(dir, [
        'init', '--topology', 'layer-first', '--no-install',
      ]);

      expect(result.code).toBe(0);
      expect(read(dir, 'blueprint.config.mjs')).toContain('reactPreset');
      expect(result.output).not.toContain('current topology is layer-first');
    });
});

describe('init topology · configured authority and option matrix', () => {
  const layerConfig = 'export default { framework: \'react\', architecture: {'
    + ' alias: \'~app\', layers: [{ name: \'pages\', does: \'routes\' }] } };\n';

  const moduleConfig = 'export default { framework: \'react\', architecture: {'
    + ' alias: \'~app\', modules: [{ name: \'auth\', does: \'auth\' }],'
    + ' layers: [{ name: \'hooks\', does: \'state\' }] } };\n';

  it('repairs same-topology layer-first and module-first configs', async () => {
    const layerFirst = repo({
      'blueprint.config.mjs': layerConfig,
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    const moduleFirst = repo({
      'blueprint.config.mjs': moduleConfig,
      'src/pages/Home.tsx': 'export const Home = 1;\n',
      'src/components/Button.tsx': 'export const Button = 1;\n',
    });

    expect((await rawCli(layerFirst, ['init', '--no-install'])).code).toBe(0);

    expect((await rawCli(layerFirst, [
      'init', '--topology', 'layer-first', '--no-install',
    ])).code).toBe(0);

    expect((await rawCli(moduleFirst, [
      'init', '--topology', 'module-first', '--authoring', '--no-install',
    ])).code).toBe(0);

    expect(read(moduleFirst, 'blueprint-authoring.md')).toBeNull();
  });

  it('refuses to let folder heuristics override a configured topology', async () => {
    const dir = repo({
      'blueprint.config.mjs': layerConfig,
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    await expectZeroWriteFailure(
      dir,
      ['init', '--topology', 'module-first', '--no-install'],
      /layer-first to module-first/,
    );
  });

  it.each([
    ['layer-first', '--authoring'],
    ['module-first', '--authoring'],
  ])('accepts --topology %s with %s', async (topology, method) => {
    const dir = repo();

    const result = await rawCli(dir, [
      'init', '--topology', topology, method, '--no-install',
    ]);

    expect(result.code).toBe(0);
  });

  it('rejects explicit module-first with a layer-first preset before writing', async () => {
    await expectZeroWriteFailure(
      repo(),
      ['init', '--topology', 'module-first', '--preset', '--no-install'],
      /generic layer presets cannot choose domain modules/,
    );
  });

  it('runs preset when layer-first is explicit', async () => {
    const dir = repo();

    const result = await rawCli(dir, [
      'init', '--topology', 'layer-first', '--preset', '--no-install',
    ]);

    expect(result.code).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toContain('reactPreset');
  });

  it('runs preset when the observed tree is layer-first', async () => {
    const dir = repo({
      'src/pages/Home.tsx': 'export const Home = 1;\n',
      'src/components/Button.tsx': 'export const Button = 1;\n',
    });

    const result = await rawCli(dir, ['init', '--preset', '--no-install']);

    expect(result.code).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toContain('reactPreset');
  });

  it('treats preset as a layer-first transformation from inferred module-first', async () => {
    const dir = repo({
      'src/auth/hooks/useAuth.ts': 'export const useAuth = 1;\n',
      'src/checkout/hooks/useCheckout.ts': 'export const useCheckout = 1;\n',
    });

    await expectZeroWriteFailure(
      dir,
      ['init', '--preset', '--no-install'],
      /module-first to layer-first requires a topology transformation/,
    );
  });
});

describe('init topology · unresolved application scope', () => {
  it('aborts even with an explicit topology until one application is selected', async () => {
    const dir = repo({
      'apps/admin/package.json': '{}',
      'apps/admin/src/main.ts': 'export const admin = 1;\n',
      'apps/web/package.json': '{}',
      'apps/web/src/main.ts': 'export const web = 1;\n',
    });

    await expectZeroWriteFailure(
      dir,
      ['init', '--topology', 'layer-first', '--no-install'],
      /multiple application scopes.*run init from that application root/s,
    );
  });
});
