import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { LayerToModuleObligation } from '../project';
import { cli, makeRepo, read, rm, write } from './conformance';

const dirs: string[] = [];

function config(layers: string[], modules?: string[]): string {
  return `export default ${JSON.stringify({
    framework: 'react',
    architecture: {
      alias: '~app',
      ...(modules ? { modules: modules.map((name) => ({ name, does: name })) } : {}),
      layers: layers.map((name) => ({ name, does: name, layout: 'file' })),
    },
  })};\n`;
}

function started(next = false): string {
  const dir = makeRepo({
    packageJson: { dependencies: { react: '^18', ...(next ? { next: '^15' } : {}) } },
    files: next
      ? {
          'blueprint.config.mjs': config(['app', 'components']),
          'src/app/login/page.tsx': 'export default () => null;\n',
        }
      : {
          'blueprint.config.mjs': config(['pages', 'containers', 'components']),
          'src/pages/Login.ts': 'export const route = 1;\n',
          'src/containers/Login.ts': 'export const login = 1;\n',
        },
  });

  dirs.push(dir);
  expect(spawnSync('git', ['init', '--quiet'], { cwd: dir }).status).toBe(0);
  expect(spawnSync('git', ['add', '.'], { cwd: dir }).status).toBe(0);

  expect(spawnSync('git', [
    '-c', 'user.name=Blueprint', '-c', 'user.email=blueprint@example.invalid',
    'commit', '--quiet', '-m', 'origin',
  ], { cwd: dir }).status).toBe(0);

  return dir;
}

async function begin(dir: string): Promise<LayerToModuleObligation> {
  expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);

  return JSON.parse(
    read(dir, 'blueprint-transformation.json') ?? '{}',
  ) as LayerToModuleObligation;
}

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop()!);
  }
});

describe('LF→MF transformation obligation', () => {
  it('survives config replacement and requires every recorded decision', async () => {
    const dir = started();
    const obligation = await begin(dir);

    expect(obligation.origin.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ unit: 'pages/Login', role: 'route-composition' }),
      expect.objectContaining({ unit: 'containers', role: 'container-seed' }),
    ]));

    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('has no destination decision');
    expect(read(dir, 'blueprint-transformation.json')).not.toBeNull();
  });

  it('verifies app/module consumption and retires its evidence', async () => {
    const dir = started();
    const obligation = await begin(dir);

    obligation.target.decisions = [
      { source: 'pages/Login', destinations: ['src/app/Login.ts'] },
      { source: 'containers', destinations: ['src/auth/components/Login.ts'] },
    ];

    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));
    write(dir, 'src/app/Login.ts', 'export const route = 1;\n');
    write(dir, 'src/auth/components/Login.ts', 'export const login = 1;\n');
    rm(path.join(dir, 'src/pages/Login.ts'));
    rm(path.join(dir, 'src/containers/Login.ts'));

    expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);
    expect(read(dir, 'blueprint-transformation.json')).toBeNull();
    expect(read(dir, 'blueprint-authoring.md')).toBeNull();
  });

  it('keeps custom MF layer names valid outside a pending transformation', async () => {
    const dir = makeRepo({
      packageJson: { dependencies: { react: '^18' } },
      files: { 'blueprint.config.mjs': config(['pages', 'containers'], ['app', 'auth']) },
    });

    dirs.push(dir);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code).toBe(0);
    expect(result.output).not.toContain('transformation incomplete');
  });

  it('preserves Next App Router files through the reserved app module', async () => {
    const dir = started(true);
    const obligation = await begin(dir);

    obligation.target.decisions = [{
      source: 'app/login', destinations: ['src/app/login/page.tsx'],
    }];

    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));

    expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);
    expect(read(dir, 'src/app/login/page.tsx')).not.toBeNull();
  });

  it('rejects regrouped origin seeds with an unchanged flat inventory', async () => {
    const dir = started();
    const obligation = await begin(dir);
    const container = obligation.origin.sources.find((source) => source.role === 'container-seed')!;

    container.unit = 'containers/Renamed';
    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));

    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('origin source does not match Git');
  });

  it('rejects a destination symlink that escapes the application root', async () => {
    const dir = started();
    const obligation = await begin(dir);
    const outside = path.join(path.dirname(dir), `${path.basename(dir)}-outside.ts`);

    fs.writeFileSync(outside, 'export const escaped = true;\n');
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, 'src/app/Login.ts'));

    obligation.target.decisions = obligation.origin.sources.map(({ unit, role }) => ({
      source: unit,
      destinations: [role === 'route-composition'
        ? 'src/app/Login.ts'
        : 'src/auth/components/Login.ts'],
    }));

    write(dir, 'src/auth/components/Login.ts', 'export const login = 1;\n');
    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));

    expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(1);
    fs.rmSync(outside);
  });
});
