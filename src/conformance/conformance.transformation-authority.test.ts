import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cli, makeRepo, read, rm, write } from './conformance';

const dirs: string[] = [];

function config(modules: boolean): string {
  return `export default ${JSON.stringify({
    framework: 'react',
    architecture: {
      alias: '~app',
      ...(modules ? { modules: [{ name: 'app', does: 'routes' }] } : {}),
      layers: [{ name: modules ? 'components' : 'pages', does: 'view', layout: 'file' }],
    },
  })};\n`;
}

function fixture(): string {
  const dir = makeRepo({
    packageJson: { dependencies: { react: '^18' } },
    files: {
      'blueprint.config.mjs': config(false),
      'src/pages/Home.ts': 'export const home = 1;\n',
    },
  });

  dirs.push(dir);

  for (const args of [
    ['init', '--quiet'], ['add', '.'],
    ['-c', 'user.name=Blueprint', '-c', 'user.email=blueprint@example.invalid',
      'commit', '--quiet', '-m', 'origin'],
  ]) {
    expect(spawnSync('git', args, { cwd: dir }).status).toBe(0);
  }

  return dir;
}

afterEach(() => {
  dirs.splice(0).forEach(rm);
});

it('retains Git authority after config cutover and generated artifact deletion', async () => {
  const dir = fixture();

  expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);
  const origin = read(dir, 'blueprint-transformation.json');

  write(dir, 'blueprint.config.mjs', config(true));
  rm(path.join(dir, 'blueprint-transformation.json'));
  rm(path.join(dir, 'blueprint-authoring.md'));
  const result = await cli(dir, ['init', '--no-install']);

  expect(result.code).toBe(1);
  expect(result.output).toContain('LF→MF transformation incomplete');
  expect(result.output).toContain('authority');
  expect(read(dir, 'blueprint-transformation.json')).toBeNull();
  expect(read(dir, 'blueprint.config.mjs')).toBe(config(true));
  write(dir, 'blueprint-transformation.json', origin!);
  const restored = await cli(dir, ['init', '--no-install']);

  expect(restored.output).toContain('has no destination decision');
});

it('rejects a new layer-first request before retiring pending module-first work', async () => {
  const dir = fixture();

  expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);
  write(dir, 'blueprint.config.mjs', config(true));
  const before = read(dir, 'blueprint-transformation.json');
  const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

  expect(result.code).toBe(1);
  expect(result.output).toContain('requested topology conflicts');
  expect(read(dir, 'blueprint-transformation.json')).toBe(before);
  expect(read(dir, 'blueprint.config.mjs')).toBe(config(true));
});

it('does not register a transformation authority during dry-run', async () => {
  const dir = fixture();

  expect((await cli(dir, ['init', '--topology', 'module-first', '--dry-run'])).code).toBe(0);

  const refs = spawnSync('git', ['for-each-ref', 'refs/blueprint/transformations'], {
    cwd: dir, encoding: 'utf8',
  });

  expect(refs.status).toBe(0);
  expect(refs.stdout).toBe('');
  expect(read(dir, 'blueprint-transformation.json')).toBeNull();
});
