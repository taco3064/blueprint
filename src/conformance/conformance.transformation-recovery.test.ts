import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { cli, makeRepo, read, rm, write } from './conformance';

const roots: string[] = [];

function fixture(applications = ['.']): string {
  const root = makeRepo({ packageJson: { name: 'recovery', workspaces: ['apps/*'] } });

  roots.push(root);

  for (const application of applications) {
    write(root, `${application}/package.json`, JSON.stringify({ dependencies: { react: '^18' } }));

    write(root, `${application}/blueprint.config.mjs`, `export default ${JSON.stringify({
      framework: 'react', architecture: {
        alias: '~app', layers: [{ name: 'pages', does: 'routes', layout: 'file' }],
      },
    })};\n`);

    write(root, `${application}/src/pages/Home.ts`, 'export const home = 1;\n');
  }

  for (const args of [
    ['init', '--quiet'], ['add', '.'],
    ['-c', 'user.name=Blueprint', '-c', 'user.email=blueprint@example.invalid',
      'commit', '--quiet', '-m', 'origin'],
  ]) {
    expect(spawnSync('git', args, { cwd: root }).status).toBe(0);
  }

  return root;
}

function refs(root: string): string[] {
  const result = spawnSync('git', [
    'for-each-ref', '--format=%(refname)', 'refs/blueprint/transformations/',
  ], { cwd: root, encoding: 'utf8' });

  expect(result.status).toBe(0);

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(rm);
});

async function recoverApplication(app: string): Promise<void> {
  const dry = await cli(app, ['init', '--recover-transformation', '--dry-run']);

  expect(dry.code, dry.output).toBe(0);
  expect(read(app, 'blueprint-transformation.json')).toBeNull();
  const recovered = await cli(app, ['init', '--recover-transformation']);

  expect(recovered.code, recovered.output).toBe(0);
  expect(recovered.output).toContain('Recovery only: LF→MF transformation remains pending');
  expect(read(app, 'blueprint-transformation.json')).toContain('src/pages/Home.ts');
  expect(read(app, 'blueprint-authoring.md')).toContain('Resume the recorded LF→MF');
  expect((await cli(app, ['init', '--no-install'])).code).toBe(1);
}

it.each([['.'], ['apps/admin', 'apps/web']])(
  'recovers after initial artifact write failure in %j', async (...applications) => {
    const root = fixture(applications);
    const selected = path.join(root, applications.at(-1)!);
    const originalWrite = fs.writeFileSync;

    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('blueprint-authoring.md')) {
        throw new Error('injected initial write failure');
      }

      return originalWrite(file, ...args);
    });

    const failed = await cli(selected, ['init', '--topology', 'module-first', '--no-install']);

    expect(failed.code).toBe(1);
    expect(failed.output).toContain('injected initial write failure');
    expect(refs(root)).toHaveLength(applications.length);
    vi.restoreAllMocks();

    for (const application of applications) {
      await recoverApplication(path.join(root, application));
    }
  },
);

it('registers every application atomically and retries ref-lock failure', async () => {
  const root = fixture(['apps/admin', 'apps/web']);
  const selected = path.join(root, 'apps/web');
  const key = createHash('sha256').update('apps/web').digest('hex');
  const lock = `.git/refs/blueprint/transformations/${key}.lock`;

  write(root, lock, 'injected lock');
  const failed = await cli(selected, ['init', '--topology', 'module-first', '--no-install']);

  expect(failed.code, failed.output).toBe(1);
  expect(failed.output).toContain('authority could not be saved');
  expect(refs(root)).toEqual([]);
  expect(read(root, 'blueprint-authoring.md')).toBeNull();
  rm(path.join(root, lock));
  const retried = await cli(selected, ['init', '--topology', 'module-first', '--no-install']);

  expect(retried.code, retried.output).toBe(0);
  expect(refs(root)).toHaveLength(2);
});

it('preserves decisions and refuses completion after cutover and JSON deletion', async () => {
  const root = fixture();

  expect((await cli(root, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);
  const initial = JSON.parse(read(root, 'blueprint-transformation.json')!);

  initial.target.decisions = [{
    source: 'pages/Home', destinations: ['src/app/Home.ts'],
    members: [{ source: 'src/pages/Home.ts', destination: 'src/app/Home.ts' }],
  }];

  const edited = JSON.stringify(initial);

  write(root, 'blueprint-transformation.json', edited);
  expect((await cli(root, ['init', '--recover-transformation'])).code).toBe(0);
  expect(read(root, 'blueprint-transformation.json')).toBe(edited);

  write(root, 'blueprint.config.mjs', `export default ${JSON.stringify({
    framework: 'react', architecture: {
      alias: '~app', modules: [{ name: 'app', does: 'routes' }],
      layers: [{ name: 'components', does: 'views', layout: 'file' }],
    },
  })};\n`);

  rm(path.join(root, 'blueprint-transformation.json'));
  const blocked = await cli(root, ['init', '--no-install']);

  expect(blocked).toEqual({ code: 1, output: expect.stringContaining('--recover-transformation') });
  expect((await cli(root, ['init', '--recover-transformation'])).code).toBe(0);
  expect(JSON.parse(read(root, 'blueprint-transformation.json')!).target.decisions).toEqual([]);
  expect((await cli(root, ['init', '--no-install'])).code).toBe(1);
});
