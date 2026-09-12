import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../cli';
import { makeRepo, read, rm } from './conformance';

const dirs: string[] = [];

const layerConfig = 'export default { framework: \'react\', architecture: {'
  + ' alias: \'~app\', layers: [{ name: \'pages\', does: \'routes\' }] } };\n';

const moduleConfig = 'export default { framework: \'react\', architecture: {'
  + ' alias: \'~app\', modules: [{ name: \'auth\', does: \'auth\' }],'
  + ' layers: [{ name: \'hooks\', does: \'state\' }] } };\n';

const legacyLayerConfig = 'export default { framework: \'react\', architecture: {'
  + ' alias: \'~app\', module: { layout: \'folder\', entry: \'index\','
  + ' private: [\'hooks\'] }, layers: [{ name: \'pages\', does: \'routes\' },'
  + ' { name: \'components\', does: \'UI\', module: { layout: \'flat\','
  + ' entry: \'component\' } }] } };\n';

const mixedModuleConfig = 'export default { framework: \'react\', architecture: {'
  + ' alias: \'~app\', modules: [{ name: \'auth\', does: \'authentication\' }],'
  + ' module: { layout: \'folder\' }, layers: [{ name: \'hooks\', does: \'state\','
  + ' module: { layout: \'flat\' } }] } };\n';

interface Workspace {
  root: string;
  web: string;
  admin: string;
}

function workspace(files: Record<string, string>): Workspace {
  const root = makeRepo({
    packageJson: { name: 'workspace', private: true, workspaces: ['apps/*'] },
    files: {
      'package-lock.json': '{}',
      'apps/web/package.json': JSON.stringify({
        name: 'web', dependencies: { react: '^18' },
      }),
      'apps/web/package-lock.json': '{}',
      'apps/admin/package.json': JSON.stringify({
        name: 'admin', dependencies: { react: '^18' },
      }),
      'apps/admin/package-lock.json': '{}',
      'apps/web/src/main.ts': 'export const web = 1;\n',
      'apps/admin/src/main.ts': 'export const admin = 1;\n',
      ...files,
    },
  });

  dirs.push(root);

  return { root, web: path.join(root, 'apps/web'), admin: path.join(root, 'apps/admin') };
}

async function cli(dir: string, args: string[]) {
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

function tree(root: string, current = root): Record<string, string> {
  const files: Record<string, string> = {};

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue;
    }

    const target = path.join(current, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, tree(root, target));
    } else {
      files[path.relative(root, target)] = fs.readFileSync(target).toString('base64');
    }
  }

  return files;
}

async function expectZeroWriteFailure(input: {
  repository: string;
  application: string;
  args: string[];
  message: RegExp;
}) {
  commit(input.repository);

  const before = {
    files: tree(input.repository),
    status: git(input.repository, 'status', '--porcelain=v1', '--untracked-files=all'),
    head: git(input.repository, 'rev-parse', 'HEAD'),
  };

  const result = await cli(input.application, input.args);

  expect(result.code).toBe(1);
  expect(result.output).toMatch(input.message);

  expect({
    files: tree(input.repository),
    status: git(input.repository, 'status', '--porcelain=v1', '--untracked-files=all'),
    head: git(input.repository, 'rev-parse', 'HEAD'),
  }).toEqual(before);
}

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('init topology · repository authority', () => {
  it.each([
    ['layer-first', layerConfig, 'blueprint.config.mjs'],
    ['module-first', moduleConfig, 'blueprint-authoring.md'],
  ])('inherits repository %s when adopting a sibling without a local config', async (
    _topology,
    config,
    expected,
  ) => {
    const target = workspace({ 'apps/admin/blueprint.config.mjs': config });

    commit(target.root);

    const result = await cli(target.web, ['init', '--no-install']);

    expect(result.code, result.output).toBe(0);
    expect(read(target.web, expected)).not.toBeNull();
    expect(result.output).not.toContain('transformation');
  });

  it('accepts the same explicit sibling target and rejects the opposite target', async () => {
    const same = workspace({ 'apps/admin/blueprint.config.mjs': layerConfig });

    commit(same.root);

    const sameResult = await cli(same.web, [
      'init', '--topology', 'layer-first', '--no-install',
    ]);

    expect(sameResult.code, sameResult.output).toBe(0);

    const opposite = workspace({ 'apps/admin/blueprint.config.mjs': layerConfig });

    await expectZeroWriteFailure({
      repository: opposite.root,
      application: opposite.web,
      args: ['init', '--topology', 'module-first', '--no-install'],
      message: /would create unsupported mixed topology.*No files were changed/s,
    });
  });

  it('allows inherited LF preset adoption and rejects preset under repository MF', async () => {
    const layer = workspace({ 'apps/admin/blueprint.config.mjs': layerConfig });

    commit(layer.root);

    const layerResult = await cli(layer.web, ['init', '--preset', '--no-install']);

    expect(layerResult.code, layerResult.output).toBe(0);
    expect(read(layer.web, 'blueprint.config.mjs')).toContain('reactPreset');

    const module = workspace({ 'apps/admin/blueprint.config.mjs': moduleConfig });

    await expectZeroWriteFailure({
      repository: module.root,
      application: module.web,
      args: ['init', '--preset', '--no-install'],
      message: /repository is authoritatively module-first/,
    });
  });

  it('rejects existing mixed repository configs before any write', async () => {
    const target = workspace({
      'apps/admin/blueprint.config.mjs': layerConfig,
      'apps/web/blueprint.config.mjs': moduleConfig,
    });

    await expectZeroWriteFailure({
      repository: target.root,
      application: target.web,
      args: ['init', '--no-install'],
      message: /configs in one repository must share one topology.*apps\/admin: layer-first.*apps\/web: module-first/s,
    });
  });
});

describe('init topology · containing repository boundary', () => {
  it('does not treat a nested Git repository config as outer topology authority', async () => {
    const target = workspace({
      'apps/web/blueprint.config.mjs': layerConfig,
      'vendor/nested/package.json': JSON.stringify({
        name: 'nested', dependencies: { react: '^18' },
      }),
      'vendor/nested/blueprint.config.mjs': moduleConfig,
      'vendor/nested/src/main.ts': 'export const nested = 1;\n',
    });

    const nested = path.join(target.root, 'vendor/nested');

    commit(nested);
    commit(target.root);

    const result = await cli(target.web, ['init', '--no-install']);

    expect(result.code, result.output).toBe(0);
    expect(result.output).not.toContain('repository transformation');
    expect(read(target.web, 'blueprint.config.mjs')).toBe(layerConfig);
  });

  it('includes an application below a build-named ancestor in repository authority', async () => {
    const target = workspace({
      'apps/web/blueprint.config.mjs': layerConfig,
      'apps/build/admin/package.json': JSON.stringify({
        name: 'build-app', dependencies: { react: '^18' },
      }),
      'apps/build/admin/package-lock.json': '{}',
      'apps/build/admin/blueprint.config.mjs': moduleConfig,
      'apps/build/admin/src/main.ts': 'export const buildApp = 1;\n',
    });

    await expectZeroWriteFailure({
      repository: target.root,
      application: target.web,
      args: ['init', '--no-install'],
      message: /apps\/build\/admin: module-first.*apps\/web: layer-first/s,
    });
  });
});

describe('init topology · repository transformation and preset safety', () => {
  it.each([
    ['layer-first', 'module-first', layerConfig],
    ['module-first', 'layer-first', moduleConfig],
  ])('coordinates repository-wide %s to %s transformation authoring', async (
    current,
    targetTopology,
    config,
  ) => {
    const target = workspace({
      'apps/admin/blueprint.config.mjs': config,
      'apps/web/blueprint.config.mjs': config,
    });

    commit(target.root);

    const result = await cli(target.web, [
      'init', '--topology', targetTopology, '--no-install',
    ]);

    const playbook = read(target.root, 'blueprint-authoring.md') ?? '';

    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('2 adopted applications are one atomic topology change');
    expect(playbook).toContain('# Blueprint repository-wide topology transformation');
    expect(playbook).toContain('`apps/admin`');
    expect(playbook).toContain('`apps/web`');
    expect(playbook).toContain(`Current repository topology: \`${current}\``);
    expect(playbook).toContain(`Target repository topology: \`${targetTopology}\``);

    expect(playbook).toContain(current === 'layer-first'
      ? '# Blueprint layer-first → module-first transformation playbook'
      : '# Blueprint module-first → layer-first transformation playbook');

    expect(playbook.match(/same target topology/g)).toHaveLength(2);
    expect(read(target.web, 'blueprint-authoring.md')).toBeNull();
  });

  it.each([layerConfig, moduleConfig])(
    'rejects preset for an existing authored config before writing', async (config) => {
      const target = workspace({ 'apps/web/blueprint.config.mjs': config });

      await expectZeroWriteFailure({
        repository: target.root,
        application: target.web,
        args: ['init', '--preset', '--no-install'],
        message: /cannot be applied.*existing authored/s,
      });
    },
  );
});

describe('init topology · 3.2 compatibility', () => {
  it('rejects mixed 4.0 MF and retired fields instead of treating them as 3.2', async () => {
    const mixed = workspace({ 'apps/web/blueprint.config.mjs': mixedModuleConfig });
    const before = tree(mixed.root);
    const result = await cli(mixed.web, ['init', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('architecture.module is retired in Blueprint 4.0');
    expect(result.output).not.toContain('transformation preflight');
    expect(tree(mixed.root)).toEqual(before);
  });

  it.each([
    ['normal', [], 'Blueprint 3.2 dry run'],
    ['explicit MF', ['--topology', 'module-first'], 'Blueprint 3.2 phase 1 dry run'],
  ])('keeps a %s legacy dry run prospective and byte-identical', async (
    _label, target, heading,
  ) => {
    const dry = workspace({
      'apps/web/blueprint.config.mjs': legacyLayerConfig,
      ...(target.length ? { 'apps/admin/blueprint.config.mjs': legacyLayerConfig } : {}),
    });

    commit(dry.root);

    const before = tree(dry.root);
    const result = await cli(dry.web, ['init', ...target, '--dry-run', '--no-install']);

    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain(heading);
    expect(result.output).toContain('to valid 4.0 layer-first');
    expect(result.output).toContain('No files were changed');
    expect(result.output).not.toContain('migrated the config');
    expect(tree(dry.root)).toEqual(before);
  });

  it('recognizes sibling 3.2 configs as repository-wide LF during sequential upgrades',
    async () => {
      const monorepo = workspace({
        'apps/web/blueprint.config.mjs': legacyLayerConfig,
        'apps/admin/blueprint.config.mjs': legacyLayerConfig,
      });

      commit(monorepo.root);

      const web = await cli(monorepo.web, ['init', '--no-install']);
      const admin = await cli(monorepo.admin, ['init', '--no-install']);
      const control = await cli(monorepo.web, ['init', '--no-install']);

      expect(web.code, web.output).toBe(0);
      expect(admin.code, admin.output).toBe(0);
      expect(control.code, control.output).toBe(0);
    });

  it('migrates a true 3.2 config to valid 4.0 LF without topology movement', async () => {
    const repair = workspace({ 'apps/web/blueprint.config.mjs': legacyLayerConfig });

    commit(repair.root);

    const repairResult = await cli(repair.web, ['init', '--no-install']);
    const migrated = read(repair.web, 'blueprint.config.mjs') ?? '';

    expect(repairResult.code, repairResult.output).toBe(0);
    expect(repairResult.output).not.toContain('transformation');
    expect(repairResult.output).toContain('migrated to valid 4.0 layer-first');
    expect(migrated).not.toContain('"module"');
    expect(migrated).toContain('"layout": "folder"');
    expect(migrated).toContain('"layout": "file"');
    expect(migrated).toContain('"entry": "component"');

    const positiveControl = await cli(repair.web, ['init', '--no-install']);

    expect(positiveControl.code, positiveControl.output).toBe(0);
  });
});

describe('init topology · 3.2 explicit MF checkpoint', () => {
  it('rejects preset before writing any repository checkpoint', async () => {
    const target = workspace({
      'apps/web/blueprint.config.mjs': legacyLayerConfig,
      'apps/admin/blueprint.config.mjs': legacyLayerConfig,
    });

    await expectZeroWriteFailure({
      repository: target.root,
      application: target.web,
      args: ['init', '--topology', 'module-first', '--preset', '--no-install'],
      message: /--topology module-first.*--preset.*No files were changed/s,
    });
  });

  it('rejects an unresolved workspace root before writing any checkpoint', async () => {
    const target = workspace({
      'apps/web/blueprint.config.mjs': legacyLayerConfig,
      'apps/admin/blueprint.config.mjs': legacyLayerConfig,
    });

    await expectZeroWriteFailure({
      repository: target.root,
      application: target.root,
      args: ['init', '--topology', 'module-first', '--no-install'],
      message: /application scope|select.*application/is,
    });
  });
});

describe('init topology · 3.2 explicit MF checkpoint writes', () => {
  it('establishes a repository-wide 4.0 LF checkpoint before 3.2 explicit MF', async () => {
    const transform = workspace({
      'apps/web/blueprint.config.mjs': legacyLayerConfig,
      'apps/admin/blueprint.config.mjs': legacyLayerConfig,
    });

    commit(transform.root);

    const phaseOne = await cli(transform.web, [
      'init', '--topology', 'module-first', '--no-install',
    ]);

    expect(phaseOne.code, phaseOne.output).toBe(0);
    expect(phaseOne.output).toContain('Blueprint 3.2 phase 1');
    expect(phaseOne.output).toContain('all 2 Blueprint configs in the repository');

    expect(phaseOne.output).toContain(
      '✓ write: apps/admin/blueprint.config.mjs (Blueprint 3.2 → 4.0 layer-first checkpoint)',
    );

    expect(read(transform.web, 'blueprint-authoring.md')).toBeNull();
    expect(read(transform.web, 'blueprint.config.mjs')).not.toContain('"module"');
    expect(read(transform.admin, 'blueprint.config.mjs')).not.toContain('"module"');
    commit(transform.root);

    const transformResult = await cli(transform.web, [
      'init', '--topology', 'module-first', '--no-install',
    ]);

    expect(transformResult.code, transformResult.output).toBe(0);

    expect(read(transform.root, 'blueprint-authoring.md'), transformResult.output).toContain(
      'Phase 1 — prove the 4.0 layer-first state before movement',
    );
  });

  it('checkpoints a 3.2 sibling when explicit MF starts from a 4.0 LF app', async () => {
    const transform = workspace({
      'apps/web/blueprint.config.mjs': layerConfig,
      'apps/admin/blueprint.config.mjs': legacyLayerConfig,
    });

    commit(transform.root);

    const phaseOne = await cli(transform.web, [
      'init', '--topology', 'module-first', '--no-install',
    ]);

    expect(phaseOne.code, phaseOne.output).toBe(0);
    expect(phaseOne.output).toContain('Blueprint 3.2 phase 1');
    expect(phaseOne.output).toContain('migrated the config to valid 4.0 layer-first');
    expect(phaseOne.output).not.toContain('all 2 Blueprint configs');
    expect(read(transform.admin, 'blueprint.config.mjs')).not.toContain('"module"');
    expect(read(transform.root, 'blueprint-authoring.md')).toBeNull();

    commit(transform.root);

    const phaseTwo = await cli(transform.web, [
      'init', '--topology', 'module-first', '--no-install',
    ]);

    expect(phaseTwo.code, phaseTwo.output).toBe(0);

    expect(read(transform.root, 'blueprint-authoring.md')).toContain(
      'Phase 1 — prove the 4.0 layer-first state before movement',
    );
  });
});
