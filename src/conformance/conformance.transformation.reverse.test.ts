import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cli, makeRepo, read, rm, write } from './conformance';
import type { RepoSpec } from './conformance';

const dirs: string[] = [];

function repo(spec: RepoSpec): string {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
}

function git(dir: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });

  expect(result.status, result.stderr).toBe(0);

  return result.stdout.trim();
}

function commit(dir: string): string {
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
    'module-first baseline',
  );

  return git(dir, 'rev-parse', 'HEAD');
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

function config(framework: 'react' | 'vue', sourceRoot = 'src'): string {
  return `export default ${JSON.stringify({
    framework,
    architecture: {
      alias: '~app',
      additionalAliases: { '@domain': `${sourceRoot}/auth` },
      sourceRoot,
      modules: [
        { name: 'app', does: 'router composition', dependsOn: ['auth'] },
        { name: 'auth', does: 'authentication' },
        { name: 'checkout', does: 'checkout', dependsOn: ['auth'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
        { name: 'hooks', does: 'state', layout: 'file' },
        { name: 'services', does: 'data', layout: 'folder', entry: 'index' },
      ],
    },
    emit: { agents: [] },
  })};\n`;
}

function expectMappingPlaybook(playbook: string, head: string): void {
  expect(playbook).toContain(`Recoverable starting commit: \`${head}\``);
  expect(playbook).toContain('src/auth/AuthRoot.ts` → `src/containers/auth/AuthRoot.ts');

  expect(playbook).toContain(
    'src/auth/components/Form/index.ts` → `src/components/Form/index.ts',
  );

  expect(playbook).toContain('src/auth/hooks/useSession.ts` → `src/hooks/useSession.ts');
  expect(playbook).toContain('~app` → `src`');
  expect(playbook).toContain('@domain` → `src/auth`');
  expect(playbook).toContain('`@domain` → `src/auth` · rewrite-or-remove');
  expect(playbook).toContain('rewrite every import to the canonical source-root alias');
  expect(playbook).not.toContain('"@domain": "src/auth"');
}

const source = {
  'src/main.ts': 'import \'~app/app/Login\';\n',
  'src/app/Login.ts': 'import \'~app/auth/AuthRoot\';\n',
  'src/auth/AuthRoot.ts': 'import \'~app/auth/components/Form\';\n',
  'src/auth/components/Form/index.ts': 'void import(\'~app/auth/services/session\');\n',
  'src/auth/hooks/useSession.ts': 'export const authSession = 1;\n',
  'src/auth/services/session/index.ts': 'export const session = 1;\n',
  'src/checkout/hooks/useSession.ts': 'import \'@domain/hooks/useSession\';\n',
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('module-first to layer-first transformation authoring', () => {
  it('routes an explicit authoring request through the topology transformation', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0' } },
      files: {
        'blueprint.config.mjs': config('react'),
        'src/auth/hooks/useAuth.ts': 'export const auth = 1;\n',
      },
    });

    commit(dir);

    const result = await cli(dir, [
      'init', '--topology', 'layer-first', '--authoring', '--no-install',
    ]);

    expect(result.code).toBe(0);
    expect(result.output).toContain('module-first → layer-first transformation authoring');

    expect(read(dir, 'blueprint-authoring.md')).toContain(
      'module-first → layer-first transformation playbook',
    );
  });

  it.each([
    {
      framework: 'React',
      packageJson: { dependencies: { react: '^18.0.0' } },
      config: config('react'),
      files: source,
      claims: ['src/app/Login.ts` → `src/pages/Login.ts', 'src/hooks/usesession.ts'],
    },
    {
      framework: 'Vue',
      packageJson: { dependencies: { vue: '^3.0.0' } },
      config: config('vue'),
      files: { ...source, 'src/app/Login.vue': '<script setup>\n</script>\n' },
      claims: ['For React/Vue, classify each reserved `app/**` file', 'folder; move'],
    },
    {
      framework: 'Next.js App Router',
      packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
      config: config('react'),
      files: {
        ...source,
        'src/app/login/page.tsx': 'import \'~app/auth/components/Form\';\n',
      },
      claims: ['src/app/login/page.tsx` → `src/app/login/page.tsx', 'preserve-next-route'],
    },
  ])('writes a complete $framework reverse playbook after preflight', async (scenario) => {
    const dir = repo({
      packageJson: scenario.packageJson,
      files: { 'blueprint.config.mjs': scenario.config, ...scenario.files },
    });

    const head = commit(dir);
    const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);
    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(result.code).toBe(0);
    expect(result.output).toContain('module-first → layer-first transformation authoring');
    expectMappingPlaybook(playbook, head);

    for (const claim of scenario.claims) {
      expect(playbook).toContain(claim);
    }

    expect(read(dir, 'blueprint.config.mjs')).toBe(scenario.config);
  });

  it('keeps dry-run byte-identical and launches only after writing the playbook', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0' } },
      files: { 'blueprint.config.mjs': config('react'), ...source },
    });

    commit(dir);
    const before = tree(dir);

    const result = await cli(dir, [
      'init', '--topology', 'layer-first', '--dry-run', '--no-install',
    ]);

    expect(result.code).toBe(0);
    expect(result.output).toContain('would write: blueprint-authoring.md');
    expect(tree(dir)).toEqual(before);
  });
});

describe('module-first to layer-first transformation safety', () => {
  it('gives an unconfigured inferred module-first Next.js tree the full recovery chain',
    async () => {
      const dir = repo({
        packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
        files: {
          'src/auth/hooks/useAuth.ts': 'export const auth = 1;\n',
          'src/checkout/hooks/useCart.ts': 'export const cart = 1;\n',
          'src/pages/index.tsx': 'export default () => null;\n',
        },
      });

      commit(dir);
      const before = tree(dir);
      const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

      expect(result.code).toBe(1);

      expect(result.output).toMatch(
        /init --topology module-first.*Agent author and verify.*commit the clean state.*init --topology layer-first/s,
      );

      expect(tree(dir)).toEqual(before);
    });

  it('rejects a dirty worktree byte-identically', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0' } },
      files: { 'blueprint.config.mjs': config('react'), ...source },
    });

    commit(dir);
    write(dir, 'src/auth/hooks/untracked.ts', 'export const dirty = 1;\n');
    const before = tree(dir);
    const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('clean worktree: The Git worktree has uncommitted changes');
    expect(tree(dir)).toEqual(before);
  });

  it('rejects hybrid Next.js router evidence byte-identically', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
      files: {
        'blueprint.config.mjs': config('react'),
        ...source,
        'src/app/login/page.tsx': 'export default () => null;\n',
        'src/pages/index.tsx': 'export default () => null;\n',
      },
    });

    commit(dir);
    const before = tree(dir);
    const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('both App Router and Pages Router trees');
    expect(tree(dir)).toEqual(before);
  });

  it('selects one nested application while checking the monorepo Git worktree', async () => {
    const workspace = repo({
      packageJson: { workspaces: ['apps/*'] },
      files: {
        'apps/web/package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'apps/web/blueprint.config.mjs': config('react'),
        'apps/web/src/auth/hooks/useAuth.ts': 'export const auth = 1;\n',
        'apps/admin/package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
        'apps/admin/src/pages/Admin.ts': 'export const Admin = 1;\n',
      },
    });

    const head = commit(workspace);
    const application = path.join(workspace, 'apps/web');

    const result = await cli(application, [
      'init', '--topology', 'layer-first', '--no-install',
    ]);

    expect(result.code).toBe(0);

    expect(read(application, 'blueprint-authoring.md')).toContain(
      `Recoverable starting commit: \`${head}\``,
    );

    expect(read(workspace, 'apps/admin/blueprint-authoring.md')).toBeNull();
  });
});
