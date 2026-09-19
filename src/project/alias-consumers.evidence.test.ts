import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aliasConsumerEvidence } from './alias-consumers';
import type { ArchitectureDef } from '../config';
import type { ProjectToolchain } from './scope';

let root: string;
const architecture = { alias: '#app', layers: [{ name: 'components', does: 'UI' }] };
const toolchain = { root: '', tsconfigs: {} };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-alias-evidence-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function evidence(arch: ArchitectureDef = architecture, tools: ProjectToolchain = toolchain) {
  return aliasConsumerEvidence(root, arch, tools);
}

describe('alias consumer evidence completeness', () => {
  it('returns exact empty and inapplicable facts', () => {
    expect(evidence({ ...architecture, alias: '~app' })).toEqual([
      { consumer: 'typescript', status: 'absent', aliases: ['~app'], files: [] },
      { consumer: 'bundler-runtime', status: 'absent', aliases: ['~app'], files: [] },
      { consumer: 'package-subpath', status: 'not-applicable', aliases: [], files: [] },
      { consumer: 'test-runner', status: 'absent', aliases: ['~app'], files: [] },
    ]);

    expect(evidence()[2]).toEqual({
      consumer: 'package-subpath', status: 'absent', aliases: ['#app'], files: [],
    });
  });

  it.each([
    ['vite', 'bundler-runtime'], ['webpack', 'bundler-runtime'],
    ['next', 'bundler-runtime'], ['@rsbuild/core', 'bundler-runtime'],
    ['@vue/cli-service', 'bundler-runtime'], ['vitest', 'test-runner'], ['jest', 'test-runner'],
  ])('records the manifest providing installed %s', (name, consumer) => {
    write('apps/web/package.json', JSON.stringify({ dependencies: { [name]: '*' } }));

    expect(evidence(architecture, { root: 'apps/web', tsconfigs: {} })
      .find((entry) => entry.consumer === consumer)).toEqual({
      consumer, status: 'unverified', aliases: ['#app'], files: ['apps/web/package.json'],
      installed: [name],
    });
  });

  it('records all TypeScript files and only missing aliases', () => {
    const arch = { ...architecture, additionalAliases: { '#other': 'other' } };

    expect(evidence(arch, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '#app/*': ['src/*'] } } }),
        'tsconfig.app.json': '{}',
        'jsconfig.json': null,
      },
    })[0]).toEqual({
      consumer: 'typescript', status: 'missing', aliases: ['#other'],
      files: ['tsconfig.json', 'tsconfig.app.json'],
    });
  });

  it('retains every unreadable configuration path', () => {
    fs.mkdirSync(path.join(root, 'webpack.config.js'));
    write('vue.config.js', '{}');

    expect(evidence()[1]).toEqual({
      consumer: 'bundler-runtime', status: 'unverified', aliases: ['#app'],
      files: ['webpack.config.js', 'vue.config.js'], unreadable: ['webpack.config.js'],
    });
  });
});

describe('alias consumer mixed configurations', () => {
  it('requires the TypeScript bridge target to match', () => {
    const text = 'import paths from \'vite-tsconfig-paths\'; export default {plugins: [paths()]};';

    expect(evidence(architecture, {
      root: '',
      tsconfigs: { 'tsconfig.json': JSON.stringify({ compilerOptions: {
        paths: { '#app/*': ['other/*'] },
      } }) },
      viteConfig: { file: 'vite.config.ts', text },
    })[1]).toEqual({
      consumer: 'bundler-runtime', status: 'unverified',
      aliases: ['#app'], files: ['vite.config.ts'],
    });
  });

  it('keeps mixed known and unknown aliases unverified', () => {
    const arch = { ...architecture, additionalAliases: { '#other': 'other' } };

    write('webpack.config.js',
      'export default {alias: {\'#app\': \'/src\', \'#other\': resolve(\'other\')}};');

    expect(evidence(arch)[1]).toEqual({
      consumer: 'bundler-runtime', status: 'unverified', aliases: ['#app', '#other'],
      files: ['webpack.config.js'],
    });
  });

  it.each([
    ['{\'#app\':\'/src\', \'#other\':\'/other\'}',
      '{\'#app\':\'/wrong\', \'#other\':\'/other\'}', ['#app']],
    ['{\'#app\':\'/src\', \'#other\':\'/wrong\'}',
      '{\'#app\':\'/src\', \'#other\':\'/other\'}', ['#other']],
    ['{\'#app\':\'/src\', \'#other\':\'/other\'}',
      '{\'#app\':\'/src\', \'#other\':\'/wrong\'}', ['#other']],
  ])('indexes every alias in every config', (first, second, aliases) => {
    write('webpack.config.js', `export default {alias:${first}};`);
    write('vue.config.js', `export default {alias:${second}};`);

    expect(evidence({ ...architecture, additionalAliases: { '#other': 'other' } })[1])
      .toEqual({ consumer: 'bundler-runtime', status: 'missing', aliases,
        files: ['webpack.config.js', 'vue.config.js'] });
  });

  it('deduplicates toolchain configs without dropping other disk configs', () => {
    write('webpack.config.js', 'export default {\'#app\':\'/wrong\'};');
    write('vue.config.js', 'export default {\'#app\':\'/src\'};');

    expect(evidence(architecture, {
      ...toolchain,
      viteConfig: { file: 'webpack.config.js', text: 'export default {\'#app\':\'/src\'};' },
    })[1]).toEqual({
      consumer: 'bundler-runtime', status: 'verified', aliases: ['#app'],
      files: ['webpack.config.js', 'vue.config.js'],
    });
  });

  it('keeps embedded Jest separate from bundler evidence', () => {
    write('package.json', JSON.stringify({ jest: { moduleNameMapper: {
      '^#app/(.*)$': '<rootDir>/src/$1',
    } } }));

    expect(evidence()[1]).toEqual({
      consumer: 'bundler-runtime', status: 'absent', aliases: ['#app'], files: [],
    });
  });

  it('keeps mixed static and conditional package imports unverified', () => {
    write('package.json', JSON.stringify({ imports: {
      '#app/*': './src/*', '#other/*': { default: './other/*' },
    } }));

    expect(evidence({ ...architecture, additionalAliases: { '#other': 'other' } })[2])
      .toEqual({ consumer: 'package-subpath', status: 'unverified',
        aliases: ['#app', '#other'], files: ['package.json'] });
  });

  it('handles a null manifest without throwing', () => {
    write('package.json', 'null');

    expect(evidence()[2]).toEqual({
      consumer: 'package-subpath', status: 'unverified', aliases: ['#app'],
      files: ['package.json'], unreadable: ['package.json'],
    });
  });
});

describe('delegated JavaScript alias configurations', () => {
  it.each([
    'import { alias } from \'./build/utils\'; export default { resolve: { alias } };',
    'module.exports = { resolve: { alias: { \'#app\': path.join(__dirname, \'src\') } } };',
    'module.exports = { moduleNameMapper: { \'^#app/(.*)$\': \'<rootDir>/src/$1\' } };',
  ])('keeps unsupported expressions unverified: %s', (text) => {
    write('jest.config.js', text);

    expect(evidence(architecture, { ...toolchain,
      viteConfig: { file: 'vite.config.ts', text },
    }).filter((item) => ['bundler-runtime', 'test-runner'].includes(item.consumer)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ consumer: 'bundler-runtime', status: 'unverified' }),
        expect.objectContaining({ consumer: 'test-runner', status: 'unverified' }),
      ]));
  });

  it('names only the proven missing alias in a readable mapper', () => {
    write('package.json', JSON.stringify({ jest: { moduleNameMapper: {
      '^#app/(.*)$': '<rootDir>/src/$1',
    } } }));

    expect(evidence({ ...architecture, additionalAliases: { '#other': 'other' } })[3])
      .toMatchObject({ status: 'missing', aliases: ['#other'] });
  });
});

describe('test-runner reading of the Vite configuration', () => {
  const vite = (target: string) => ({
    file: 'vite.config.ts',
    text: 'export default { test: {}, resolve: { alias: { '
      + `'#app': fileURLToPath(new URL('${target}', import.meta.url)) } } };`,
  });

  it.each([
    ['./src', 'verified'],
    ['./lib', 'missing'],
  ])('reads vite.config when Vitest has no configuration of its own: %s', (target, status) => {
    write('package.json', JSON.stringify({ devDependencies: { vitest: '*' } }));

    expect(evidence(architecture, { ...toolchain, viteConfig: vite(target) })[3]).toEqual({
      consumer: 'test-runner', status, aliases: ['#app'], files: ['vite.config.ts'],
    });
  });

  it.each(['js', 'cjs', 'mjs', 'ts', 'mts', 'cts'])(
    'keeps an existing vitest.config.%s authoritative over vite.config',
    (extension) => {
      write('package.json', JSON.stringify({ dependencies: { vitest: '*' } }));
      write(`vitest.config.${extension}`, 'export default { alias: { \'#app\': \'/lib\' } };');

      expect(evidence(architecture, { ...toolchain, viteConfig: vite('./src') })[3]).toEqual({
        consumer: 'test-runner', status: 'missing', aliases: ['#app'],
        files: [`vitest.config.${extension}`],
      });
    },
  );

  it('leaves vite.config to the bundler when Vitest is not installed', () => {
    write('package.json', JSON.stringify({ devDependencies: { vite: '*' } }));

    const [, bundler, , runner] = evidence(architecture, {
      ...toolchain, viteConfig: vite('./src'),
    });

    expect(bundler.status).toBe('verified');

    expect(runner).toEqual({
      consumer: 'test-runner', status: 'absent', aliases: ['#app'], files: [],
    });
  });

  it('reads vite.config beside a Jest configuration when Vitest is installed too', () => {
    write('package.json', JSON.stringify({ devDependencies: { vitest: '*', jest: '*' } }));
    write('jest.config.js', 'module.exports = { alias: { \'#app\': \'src\' } };');

    expect(evidence(architecture, { ...toolchain, viteConfig: vite('./src') })[3]).toEqual({
      consumer: 'test-runner', status: 'verified', aliases: ['#app'],
      files: ['vite.config.ts', 'jest.config.js'],
    });
  });
});
