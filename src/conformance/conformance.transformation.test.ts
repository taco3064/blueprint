import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runInit } from '../bootstrap';
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
    'layer-first baseline',
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

function layerConfig(framework: 'react' | 'vue', layers: string[]): string {
  return `export default ${JSON.stringify({
    framework,
    architecture: {
      alias: '~app',
      layers: layers.map((name) => ({
        name,
        does: `${name} responsibility`,
        layout: 'folder',
        entry: 'index',
      })),
    },
  })};\n`;
}

function expectPlaybook(
  playbook: string,
  facts: { head: string; seedSource: string; routerClaim: string; framework?: string },
): void {
  expect(playbook).toContain(`Recoverable starting commit: \`${facts.head}\``);
  expect(playbook).toContain('Current topology: `layer-first`');
  expect(playbook).toContain('Target topology: `module-first`');
  expect(playbook).toContain(`Primary seed source: \`${facts.seedSource}\``);
  expect(playbook).toContain('Agent decisions');
  expect(playbook).toContain('git mv');
  expect(playbook).toContain('never rewrite paths mechanically');
  expect(playbook).toContain(facts.routerClaim);
  expect(playbook).toContain('npx blueprint deps --json');
  expect(playbook).toContain('temporary negative control');

  if (facts.framework === 'Next.js App Router') {
    expect(playbook).toContain('#### app/login (app seed)');
    expect(playbook).toContain('app/login → hooks/useAuth (1)');
  }
}

const scenarios: {
  framework: string;
  packageJson: Record<string, unknown>;
  config: string;
  files: Record<string, string>;
  routerClaim: string;
  seedSource: string;
}[] = [
  {
    framework: 'React',
    packageJson: { dependencies: { react: '^18.0.0' } },
    config: layerConfig('react', ['pages', 'containers', 'components', 'hooks']),
    files: {
      'src/pages/Login.ts': 'import \'~app/containers/Login\';\n',
      'src/containers/Login/index.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
    },
    routerClaim: 'For React/Vue, move route composition',
    seedSource: 'containers',
  },
  {
    framework: 'Vue',
    packageJson: { dependencies: { vue: '^3.0.0' } },
    config: layerConfig('vue', ['pages', 'containers', 'components', 'hooks']),
    files: {
      'src/pages/Login.vue': [
        '<script setup>',
        'import Login from \'~app/containers/Login\'',
        '</script>',
      ].join('\n'),
      'src/containers/Login/index.ts': 'import \'~app/hooks/useAuth\';\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
    },
    routerClaim: 'For React/Vue, move route composition',
    seedSource: 'containers',
  },
  {
    framework: 'Next.js App Router',
    packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
    config: layerConfig('react', ['app', 'components', 'hooks']),
    files: {
      'src/app/login/page.tsx': 'import \'~app/hooks/useAuth\';\nexport default () => null;\n',
      'src/hooks/useAuth.ts': 'export const auth = 1;\n',
    },
    routerClaim: 'Preserve the framework-owned physical `app/**`',
    seedSource: 'none',
  },
];

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('layer-first to module-first transformation authoring', () => {
  it.each(scenarios)(
    'writes one executable $framework playbook after preflight',
    async (scenario) => {
      const dir = repo({
        packageJson: scenario.packageJson,
        files: {
          'blueprint.config.mjs': scenario.config,
          ...scenario.files,
        },
      });

      const head = commit(dir);

      const result = await cli(dir, [
        'init', '--topology', 'module-first', '--no-install',
      ]);

      const playbook = read(dir, 'blueprint-authoring.md') ?? '';

      expect(result.code).toBe(0);
      expect(result.output).toContain('transformation preflight passed');
      expectPlaybook(playbook, { head, ...scenario });
      expect(read(dir, 'blueprint.config.mjs')).toBe(scenario.config);
    },
  );

  it('uses an explicitly disclosed survey model when no authored config exists', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0' } },
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/pages/Login/index.ts': 'import \'~app/hooks/useAuth\';\n',
        'src/hooks/useAuth/index.ts': 'export const auth = 1;\n',
      },
    });

    commit(dir);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(result.code).toBe(0);
    expect(playbook).toContain('Import-resolution basis: `survey-detected`');
  });
});

describe('layer-first to module-first transformation safety', () => {
  it('rejects dirty Git with byte-identical source, config, baseline, and generated files',
    async () => {
      const dir = repo({
        packageJson: { dependencies: { react: '^18.0.0' } },
        files: {
          'blueprint.config.mjs': layerConfig('react', ['pages', 'components']),
          '.blueprint-baseline.json': '{"version":1,"findings":[]}\n',
          'src/pages/Home.ts': 'export const Home = 1;\n',
        },
      });

      commit(dir);
      write(dir, 'src/components/untracked.ts', 'export const dirty = 1;\n');
      const before = { tree: tree(dir), status: git(dir, 'status', '--porcelain=v1') };
      const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

      expect(result.code).toBe(1);
      expect(result.output).toContain('clean worktree: The Git worktree has uncommitted changes');
      expect({ tree: tree(dir), status: git(dir, 'status', '--porcelain=v1') }).toEqual(before);
    });

  it('rejects Next.js Pages Router before mutation even in a clean Git repository', async () => {
    const config = layerConfig('react', ['pages', 'components']);

    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
      files: {
        'blueprint.config.mjs': config,
        'src/pages/index.tsx': 'export default () => null;\n',
      },
    });

    commit(dir);
    const before = { tree: tree(dir), status: git(dir, 'status', '--porcelain=v1') };
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code).toBe(1);

    expect(result.output).toContain(
      'Pages Router → module-first requires a framework router migration',
    );

    expect({ tree: tree(dir), status: git(dir, 'status', '--porcelain=v1') }).toEqual(before);
  });

  it('rejects unresolved Next.js router identity without calling it Pages Router', async () => {
    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0', next: '^15.0.0' } },
      files: {
        'blueprint.config.mjs': layerConfig('react', ['components', 'hooks']),
        'src/components/Button.ts': 'export const Button = 1;\n',
      },
    });

    commit(dir);
    const before = tree(dir);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('Cannot verify a Next.js App Router surface');
    expect(result.output).not.toContain('Pages Router → module-first');
    expect(tree(dir)).toEqual(before);
  });
});

describe('layer-first to module-first execution boundary', () => {
  it('selects one nested application while preflighting the whole monorepo Git worktree',
    async () => {
      const workspace = repo({
        packageJson: { workspaces: ['apps/*'] },
        files: {
          'apps/web/package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
          'apps/web/blueprint.config.mjs': layerConfig('react', ['pages', 'components']),
          'apps/web/src/pages/Home.ts': 'export const Home = 1;\n',
          'apps/admin/package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
          'apps/admin/src/pages/Admin.ts': 'export const Admin = 1;\n',
        },
      });

      const head = commit(workspace);
      const application = path.join(workspace, 'apps/web');

      const result = await cli(application, [
        'init', '--topology', 'module-first', '--no-install',
      ]);

      expect(result.code).toBe(0);

      expect(read(application, 'blueprint-authoring.md')).toContain(
        `Recoverable starting commit: \`${head}\``,
      );

      expect(read(workspace, 'apps/admin/blueprint-authoring.md')).toBeNull();
    });

  it('keeps dry-run read-only and launches the requested Agent only after writing the playbook',
    async () => {
      const files = {
        'blueprint.config.mjs': layerConfig('react', ['pages', 'containers', 'hooks']),
        'src/pages/Login.ts': 'import \'~app/containers/Login\';\n',
        'src/containers/Login/index.ts': 'import \'~app/hooks/useAuth\';\n',
        'src/hooks/useAuth.ts': 'export const auth = 1;\n',
      };

      const dry = repo({
        packageJson: { dependencies: { react: '^18.0.0' } },
        files,
      });

      commit(dry);
      const before = tree(dry);

      const dryResult = await cli(dry, [
        'init', '--topology', 'module-first', '--no-install', '--dry-run',
      ]);

      expect(dryResult.code).toBe(0);
      expect(dryResult.output).toContain('would write: blueprint-authoring.md');
      expect(tree(dry)).toEqual(before);

      const launched = repo({
        packageJson: { dependencies: { react: '^18.0.0' } },
        files,
      });

      commit(launched);
      const calls: unknown[][] = [];

      await runInit(launched, {
        topology: 'module-first',
        install: false,
        agent: 'codex',
        log: () => {},
        spawn: (...args) => {
          calls.push(args);

          return { status: 0 };
        },
      });

      expect(read(launched, 'blueprint-authoring.md')).not.toBeNull();

      expect(calls).toMatchObject([['codex', [
        'Read blueprint-authoring.md at the repository root and execute it end to end.',
      ], launched]]);
    });
});
