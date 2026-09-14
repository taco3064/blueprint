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

function layerConfig(
  framework: 'react' | 'vue',
  layers: string[],
  agents?: ('claude' | 'agents')[],
): string {
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
    ...(agents ? { emit: { agents } } : {}),
  })};\n`;
}

function expectContainerPlacement(playbook: string): void {
  expect(playbook).toContain('Containers are module seeds, not repeated inner technical layers');
  expect(playbook).toContain('loadout/LoadoutScreen.tsx');
  expect(playbook).toContain('Remove the old pages and containers layer declarations');
  expect(playbook).toContain('Review allowedImporters and other layer-name');
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
  expectContainerPlacement(playbook);
  expect(playbook).toContain('never rewrite paths mechanically');
  expect(playbook).toContain(facts.routerClaim);
  expect(playbook).toContain('npx blueprint deps --json');
  expect(playbook).toContain('temporary negative control');

  if (facts.framework === 'Next.js App Router') {
    expect(playbook).toContain('#### app/login (app seed)');
    expect(playbook).toContain('app/login → hooks/useAuth (1)');
  }
}

async function verifyPendingEvidenceSteps(dir: string, playbook: string): Promise<void> {
  const phase = playbook.split('## Phase 1')[1].split('## Neutral')[0];
  const commands = [...phase.matchAll(/`npx blueprint ([^`]+)`/g)].map((match) => match[1]);
  const before = tree(dir);

  expect(commands).toEqual(['inspect --json', 'deps --json']);
  expect(phase).toContain('do not request the opposite topology');

  for (const command of commands) {
    expect((await cli(dir, command.split(' '))).code).toBe(0);
  }

  expect(tree(dir)).toEqual(before);
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
      const obligation = JSON.parse(read(dir, 'blueprint-transformation.json') ?? '{}');

      expect(result.code).toBe(0);
      expect(result.output).toContain('transformation preflight passed');
      expectPlaybook(playbook, { head, ...scenario });
      await verifyPendingEvidenceSteps(dir, playbook);

      expect(obligation).toMatchObject({
        version: 1,
        direction: 'layer-first-to-module-first',
        origin: { head, topology: 'layer-first', sourceRoot: 'src' },
        target: { topology: 'module-first', decisions: [] },
      });

      expect(read(dir, 'blueprint.config.mjs')).toBe(scenario.config);
    },
  );

  it('does not leak a Claude launcher from an agents-only configured transformation', async () => {
    const config = layerConfig('react', ['pages', 'components'], ['agents']);

    const dir = repo({
      packageJson: { dependencies: { react: '^18.0.0' } },
      files: {
        'blueprint.config.mjs': config,
        'src/pages/Home.ts': 'export const Home = 1;\n',
      },
    });

    commit(dir);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(result.code).toBe(0);
    expect(read(dir, '.claude/commands/blueprint-author.md')).toBeNull();
    expect(playbook).not.toContain('.claude/commands/blueprint-author.md');
  });

  it('uses survey evidence for unmanaged module-first authoring without inventing a source '
    + 'topology',
  async () => {
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
    expect(playbook).toContain('module-first was selected');
    expect(playbook).toContain('## Survey evidence');
    expect(result.output).not.toContain('transformation');
  });
});

describe('layer-first to module-first transformation safety', () => {
  it.each([{ flags: [] }, { flags: ['--dry-run'] }])('rejects dirty Git without mutation ($flags)',
    async ({ flags }) => {
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

      const result = await cli(dir, [
        'init', '--topology', 'module-first', '--no-install', ...flags,
      ]);

      expect(result.code).toBe(1);
      expect(result.output).toContain('clean worktree: The Git worktree has uncommitted changes');
      expect(result.output).toContain('Transformation is blocked, not complete');
      expect(result.output).toContain('Do not bypass this refusal');

      expect(result.output).toContain(
        'If creating the required Git checkpoint is not authorized, stop',
      );

      expect(result.output).toContain('--dry-run is only a preview');
      expect(result.output).toContain('do not prove historical topology');
      expect(git(dir, 'for-each-ref', 'refs/blueprint/transformations/')).toBe('');
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
