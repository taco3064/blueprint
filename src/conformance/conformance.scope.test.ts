import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { cli, configSource, makeRepo, rm } from './conformance';

const dirs: string[] = [];

const repo = (files: Record<string, string>): string => {
  const dir = makeRepo({ files });

  dirs.push(dir);

  return dir;
};

const multiAppRepo = (): string => repo({
  'apps/admin/package.json': '{"name":"admin"}',
  'apps/admin/src/main.ts': 'export const admin = true;\n',
  'apps/web/package.json': '{"name":"web"}',
  'apps/web/src/main.ts': 'export const web = true;\n',
});

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('brownfield project scope conformance (#422)', () => {
  it('resolves referenced aliases without rewriting the solution config', async () => {
    const blueprint: Blueprint = {
      framework: 'react',
      architecture: {
        sourceRoot: '.',
        alias: '@',
        layers: [
          { name: 'app', does: 'compose the application' },
          { name: 'features', does: 'implement features' },
        ],
        module: { layout: 'flat', entry: 'index', private: [] },
      },
      rules: { unusedVars: 'error' },
    };

    const dir = repo({
      'blueprint.config.mjs': configSource(blueprint),
      'tsconfig.json': JSON.stringify({
        files: [],
        references: [{ path: './config/ts/tsconfig.app.json' }],
      }),
      'config/ts/tsconfig.app.json': JSON.stringify({
        compilerOptions: { baseUrl: '../..', paths: { '@/*': ['./*'] } },
        include: ['../../app', '../../features'],
      }),
      'app/index.ts': 'import { feature } from \'@/features\';\nexport { feature };\n',
      'features/index.ts': 'export const feature = true;\n',
    });

    const survey = await cli(dir, ['survey', '--json']);

    const result = JSON.parse(survey.output) as {
      sourceRoot: string;
      aliases: Record<string, string>;
      unresolved: unknown[];
    };

    expect(result.sourceRoot).toBe('.');
    expect(result.aliases['@']).toBe('.');
    expect(result.unresolved).toEqual([]);

    const init = await cli(dir, ['init', '--dry-run', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).not.toContain('tsconfig.json (import alias added)');
    expect(init.output).not.toContain('Add import alias');
  });

  it('keeps src when root tooling globs cover auxiliary directories', async () => {
    const dir = repo({
      'tsconfig.json': JSON.stringify({
        include: ['src/**/*.ts', 'mock/**/*.ts', 'types/**/*.d.ts', 'vite.config.ts'],
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'], '@build/*': ['build/*'] } },
      }),
      'src/views/home.ts': 'export const home = true;\n',
      'src/stores/user.ts': 'export const user = true;\n',
      'mock/server.ts': 'export const server = true;\n',
      'types/env.d.ts': 'declare const env: string;\n',
      'vite.config.ts': 'export default {};\n',
    });

    const survey = await cli(dir, ['survey', '--json']);

    const result = JSON.parse(survey.output) as {
      sourceRoot: string;
      totalFiles: number;
    };

    expect(result.sourceRoot).toBe('src');
    expect(result.totalFiles).toBe(2);
  });

  it('requires an application source root before authoring in a multi-app workspace', async () => {
    const dir = multiAppRepo();

    const survey = await cli(dir, ['survey', '--json']);

    const result = JSON.parse(survey.output) as {
      scopeRequired?: boolean;
      totalFiles: number;
    };

    expect(result.scopeRequired).toBe(true);
    expect(result.totalFiles).toBe(0);

    const init = await cli(dir, ['init', '--dry-run', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('blueprint survey');
    expect(init.output).toContain('--source-root <application>/src');
    expect(init.output).toContain('not a starter verdict');
    expect(init.output).not.toContain('early exit the playbook prescribes IS completion');
  });

  it('qualifies the threshold claim in forced authoring output and help', async () => {
    const dir = multiAppRepo();

    const forced = await cli(dir, ['init', '--authoring', '--dry-run', '--no-install']);

    expect(forced.code).toBe(0);
    expect(forced.output).not.toContain('playbook\'s own verdict will be the early exit');

    const help = await cli(dir, ['init', '--help']);

    expect(help.output).toContain('zero-file workspace survey is not a starter verdict');
    expect(help.output).toContain('multi-app workspace must choose --source-root first');
  });
});
