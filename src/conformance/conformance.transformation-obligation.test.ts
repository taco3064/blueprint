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

function started(next = false, extraPage = false): string {
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
          ...(extraPage ? { 'src/pages/Register.ts': 'export const route = 1;\n' } : {}),
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

function aliasedStarted(alias: boolean): string {
  const actual = started();

  if (!alias) {
    return actual;
  }

  const dir = `${actual}-alias`;

  fs.symlinkSync(actual, dir, 'junction');
  dirs.push(dir);

  return dir;
}

async function begin(dir: string): Promise<LayerToModuleObligation> {
  expect((await cli(dir, ['init', '--topology', 'module-first', '--no-install'])).code).toBe(0);

  return JSON.parse(
    read(dir, 'blueprint-transformation.json') ?? '{}',
  ) as LayerToModuleObligation;
}

async function consumeMembers(dir: string, altered: boolean): Promise<void> {
  const obligation = await begin(dir);

  obligation.target.decisions = obligation.origin.sources.map(({ unit, role, members }) => {
    const destination = role === 'route-composition'
      ? 'src/app/Login.ts'
      : 'src/auth/components/Login.ts';

    return { source: unit, destinations: [destination],
      members: members.map((source) => ({ source, destination })) };
  });

  for (const source of obligation.origin.sources.flatMap((source) => source.members)) {
    rm(path.join(dir, source));
  }

  write(dir, 'src/app/Login.ts', `export const route = ${altered ? 2 : 1};\n`);
  write(dir, 'src/auth/components/Login.ts', 'export const login = 1;\n');
  write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));
  write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation)}\n`);
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

  it.each([false, true])('retires consumed obligations with path alias: %s', async (alias) => {
    const dir = aliasedStarted(alias);
    const obligation = await begin(dir);

    expect(obligation.origin.applicationRoot).toBe('.');

    obligation.target.decisions = [
      { source: 'pages/Login', destinations: ['src/app/Login.ts'],
        members: [{ source: 'src/pages/Login.ts', destination: 'src/app/Login.ts' }] },
      { source: 'containers', destinations: ['src/auth/components/Login.ts'],
        members: [{ source: 'src/containers/Login.ts',
          destination: 'src/auth/components/Login.ts' }] },
    ];

    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));
    write(dir, 'src/app/Login.ts', 'export const route = 1;\n');
    write(dir, 'src/auth/components/Login.ts', 'export const login = 1;\n');
    rm(path.join(dir, 'src/pages/Login.ts'));
    rm(path.join(dir, 'src/containers/Login.ts'));

    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code, result.output).toBe(0);
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
      members: [{ source: 'src/app/login/page.tsx', destination: 'src/app/login/page.tsx' }],
    }];

    write(dir, 'blueprint-transformation.json', `${JSON.stringify(obligation, null, 2)}\n`);
    write(dir, 'blueprint.config.mjs', config(['components'], ['app', 'auth']));

    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code, result.output).toBe(0);
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

    expect(result.output)
      .toContain('origin differs from the retained Git transformation authority');
  });

  it('rejects a destination symlink that escapes the application root', async () => {
    const dir = started();
    const obligation = await begin(dir);
    const outside = path.join(path.dirname(dir), `${path.basename(dir)}-outside.ts`);

    fs.writeFileSync(outside, 'export const escaped = true;\n');
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, 'src/app/Login.ts'));

    obligation.target.decisions = obligation.origin.sources.map(({ unit, role, members }) => ({
      source: unit,
      members: members.map((source) => ({ source, destination: role === 'route-composition'
        ? 'src/app/Login.ts'
        : 'src/auth/components/Login.ts' })),
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

function commonjsOrigin(extension: string) {
  const dir = started();
  const origin = `src/containers/Login.${extension}`;
  const destination = `src/auth/components/Login.${extension}`;

  const source = extension === 'ts'
    ? 'import service = require(\'../services/foo\');\nexport = service;\n'
    : 'const service = require(\'../services/foo\');\nmodule.exports = service;\n';

  rm(path.join(dir, 'src/containers/Login.ts'));
  write(dir, origin, source);
  write(dir, `src/services/foo.${extension}`, 'module.exports = 1;\n');
  write(dir, 'blueprint.config.mjs', config(['pages', 'containers', 'components', 'services']));
  expect(spawnSync('git', ['add', '.'], { cwd: dir }).status).toBe(0);

  expect(spawnSync('git', [
    '-c', 'user.name=Blueprint', '-c', 'user.email=blueprint@example.invalid',
    'commit', '--quiet', '-m', 'CommonJS origin',
  ], { cwd: dir }).status).toBe(0);

  return { dir, origin, destination, source };
}

async function moveCommonjs(extension: string): Promise<string> {
  const { dir, origin, destination, source } = commonjsOrigin(extension);

  const obligation = await begin(dir);

  obligation.target.decisions = obligation.origin.sources.map(({ unit, role, members }) => {
    const target = role === 'route-composition' ? 'src/app/Login.ts' : destination;

    return { source: unit, destinations: [target],
      members: members.map((member) => ({ source: member, destination: target })) };
  });

  write(dir, destination, source.replace('../services/foo', '~app/auth/services/foo'));
  write(dir, `src/auth/services/foo.${extension}`, 'module.exports = 1;\n');
  write(dir, 'src/app/Login.ts', 'export const route = 1;\n');
  rm(path.join(dir, origin));
  rm(path.join(dir, `src/services/foo.${extension}`));
  rm(path.join(dir, 'src/pages/Login.ts'));
  write(dir, 'blueprint.config.mjs', config(['components', 'services'], ['app', 'auth']));
  write(dir, 'blueprint-transformation.json', JSON.stringify(obligation));

  return dir;
}

describe('LF→MF consumed member identity', () => {
  it.each(['cjs', 'ts'])(
    'retires moved %s members after require path changes', async (extension) => {
      const dir = await moveCommonjs(extension);
      const inspection = await cli(dir, ['inspect', '--json']);

      expect(inspection.code, inspection.output).toBe(0);

      const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

      expect(result.code, result.output).toBe(0);
      expect(read(dir, 'blueprint-transformation.json')).toBeNull();
    },
  );

  it.each([
    [true, false, 'destination src/app/Login.ts is reused'],
    [false, true, 'transfer identity is unproven for src/pages/Login.ts'],
  ] as const)('rejects reused=%s or altered=%s targets', async (reused, altered, diagnostic) => {
    const dir = started(false, reused);

    await consumeMembers(dir, altered);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain(diagnostic);
    expect(read(dir, 'src/pages/Login.ts')).toBeNull();
    expect(read(dir, 'blueprint-transformation.json')).not.toBeNull();
    expect(read(dir, 'blueprint-authoring.md')).not.toBeNull();
  });

  it('rejects hiding a consumed source in an unscanned text destination', async () => {
    const dir = started();

    await consumeMembers(dir, false);

    const obligation = JSON.parse(
      read(dir, 'blueprint-transformation.json')!,
    ) as LayerToModuleObligation;

    const route = obligation.target.decisions
      .find((decision) => decision.source === 'pages/Login')!;

    fs.renameSync(path.join(dir, 'src/app/Login.ts'), path.join(dir, 'src/app/Login.txt'));
    route.destinations = ['src/app/Login.txt'];
    route.members[0].destination = 'src/app/Login.txt';
    write(dir, 'blueprint-transformation.json', JSON.stringify(obligation));
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain('transfer identity is unproven for src/pages/Login.ts');
    expect(read(dir, 'blueprint-transformation.json')).not.toBeNull();
  });
});
