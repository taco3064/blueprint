import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const NOISE_ROOTS = ['build', 'vendor/noise', '.venv/noise',
  'storybook-static/noise', '.claude/worktrees/noise'];
export const CONTROL_PATHS = [
  'vendor/tracked.ts', '.storybook/tracked.ts', '.claude/worktrees/tracked.ts',
  'scripts/untracked.ts', 'consumer/entry.ts', 'consumer/neighbour.ts',
  'referenced/entry.ts', 'referenced/neighbour.ts',
];

export function writeFixtureFile(root, name, content = 'export const value = 1;\n') {
  const target = path.join(root, name);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

export function fixtureBlueprint() {
  return {
    framework: 'react',
    architecture: {
      alias: '~app', sourceRoot: 'src',
      modules: [{ name: 'auth', does: 'Authentication' }],
      layers: [{ name: 'components', does: 'Presentation', layout: 'file' }],
      testFiles: ['**/*.test.ts'], consumerFiles: ['consumer/entry.ts'],
    },
  };
}

export function addControls(root) {
  writeFixtureFile(root, 'src/auth/components/entry.ts',
    'import \'../../../referenced/entry\';\nexport const value = 1;\n');

  const ignorePath = path.join(root, '.gitignore');
  const existing = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8') : '';

  writeFixtureFile(root, '.gitignore',
    existing + '\nconsumer/\nreferenced/\nunrelated/\nnode_modules/\n' + NOISE_ROOTS.join('/\n') + '/\n');

  for (const name of CONTROL_PATHS) {
    const prefix = name.startsWith('.claude/') ? '../../' : '../';

    writeFixtureFile(root, name, `import '${prefix}src/auth/components/entry';\n`);
  }

  writeFixtureFile(root, 'consumer/ignored.test.ts', 'invalid test source {{{');
  writeFixtureFile(root, 'unrelated/local.ts');
  writeFixtureFile(root, 'node_modules/unreachable.ts', 'invalid source {{{');

  git(root, 'add', '-f', 'src', '.gitignore', 'vendor/tracked.ts',
    '.storybook/tracked.ts', '.claude/worktrees/tracked.ts');
}

export function addNoise(root, count = 5000) {
  for (let index = 0; index < count; index++) {
    writeFixtureFile(root, `${NOISE_ROOTS[index % NOISE_ROOTS.length]}/${index}.ts`);
  }
}

export function makeFixture(parent, name, { nested = false, noise = false } = {}) {
  const repository = path.join(parent, name);
  const root = nested ? path.join(repository, 'packages/application') : repository;

  fs.mkdirSync(root, { recursive: true });
  git(repository, 'init', '-q');
  addControls(root);

  if (noise) {
    addNoise(root);
  }

  if (nested) {
    addNoise(path.join(repository, 'repository-noise'));
    writeFixtureFile(repository, '.gitignore', 'repository-noise/\n');

    for (let index = 0; index < 5000; index++) {
      writeFixtureFile(repository, `packages/sibling/src/${index}.ts`);
    }
  }

  return { name, root, repository, blueprint: fixtureBlueprint() };
}
