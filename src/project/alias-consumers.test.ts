import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aliasConsumerEvidence } from './alias-consumers';

const architecture = {
  alias: '#app',
  layers: [{ name: 'components', does: 'UI' }],
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-alias-consumers-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, text: string): void {
  fs.writeFileSync(path.join(root, file), text);
}

describe('aliasConsumerEvidence', () => {
  it('reports each recognised consumer independently', () => {
    write('vite.config.ts', 'export default { resolve: { alias: { \'#app\': \'/src\' } } };');
    write('vitest.config.ts', 'export default { resolve: { alias: { \'#app\': \'/src\' } } };');
    write('package.json', JSON.stringify({ imports: { '#app/*': './src/*' } }));

    const evidence = aliasConsumerEvidence(root, architecture, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '#app/*': ['./src/*'] } },
        }),
      },
      viteConfig: {
        file: 'vite.config.ts',
        text: fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf-8'),
      },
    });

    expect(evidence.map(({ consumer, status }) => ({ consumer, status }))).toEqual([
      { consumer: 'typescript', status: 'verified' },
      { consumer: 'bundler-runtime', status: 'verified' },
      { consumer: 'package-subpath', status: 'verified' },
      { consumer: 'test-runner', status: 'verified' },
    ]);
  });

  it('does not let TypeScript evidence qualify another consumer', () => {
    write('vite.config.ts', 'import plugin from \'#app/plugin\'; export default {};');
    write('vitest.config.ts', 'export default {};');
    write('package.json', JSON.stringify({ imports: {} }));

    const evidence = aliasConsumerEvidence(root, architecture, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '#app/*': ['./src/*'] } },
        }),
      },
      viteConfig: {
        file: 'vite.config.ts',
        text: 'import plugin from \'#app/plugin\'; export default {};',
      },
    });

    expect(evidence.map(({ status }) => status)).toEqual([
      'verified', 'missing', 'missing', 'missing',
    ]);
  });

  it('keeps absent and unreadable consumers unverified rather than green', () => {
    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: { 'tsconfig.json': '{ broken' },
    });

    expect(evidence.map(({ status }) => status)).toEqual([
      'unverified', 'absent', 'not-applicable', 'absent',
    ]);
  });

  it('rejects wrong targets, comments, and a second runner without the alias', () => {
    write('vite.config.ts', '// aliases: { \'#app\': \'/src\' }\nexport default {};');
    write('vitest.config.ts', 'export default { resolve: { alias: { \'#app\': \'/src\' } } };');
    write('jest.config.ts', 'export default {};');
    write('package.json', JSON.stringify({ imports: { '#app/*': './other/*' } }));

    const evidence = aliasConsumerEvidence(root, architecture, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '#app/*': ['./other/*'] } },
        }),
      },
      viteConfig: {
        file: 'vite.config.ts',
        text: '// aliases: { \'#app\': \'/src\' }\nexport default {};',
      },
    });

    expect(evidence.map(({ status }) => status)).toEqual([
      'missing', 'missing', 'missing', 'missing',
    ]);
  });
});

describe('aliasConsumerEvidence · installed consumers', () => {
  it('keeps installed consumers without static configuration unverified', () => {
    write('package.json', JSON.stringify({
      devDependencies: { vite: '^7', vitest: '^4' },
    }));

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {},
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('unverified');

    expect(evidence.find(({ consumer }) => consumer === 'test-runner')?.status)
      .toBe('unverified');
  });

  it('recognises a React FSD Jest moduleNameMapper target', () => {
    write('package.json', JSON.stringify({
      devDependencies: { jest: '^30' },
      jest: { moduleNameMapper: { '^~app/(.*)$': '<rootDir>/src/$1' } },
    }));

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {},
    });

    expect(evidence.find(({ consumer }) => consumer === 'test-runner')).toMatchObject({
      status: 'verified', files: ['package.json#jest'],
    });
  });

  it('keeps unreadable files and conditional package imports unverified', () => {
    fs.mkdirSync(path.join(root, 'vite.config.ts'));

    write('package.json', JSON.stringify({
      imports: { '#app/*': { development: './src/*' } },
    }));

    const evidence = aliasConsumerEvidence(root, architecture, {
      root: '',
      tsconfigs: {},
      viteConfig: { file: 'vite.config.ts', text: null as unknown as string },
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')).toMatchObject({
      status: 'unverified', unreadable: ['vite.config.ts'],
    });

    expect(evidence.find(({ consumer }) => consumer === 'package-subpath')?.status)
      .toBe('unverified');
  });

  it('reports an absent package-subpath manifest and recognises webpack chaining', () => {
    write('webpack.config.js', 'config.resolve.alias.set(\'#app\', \'/src\');');

    const evidence = aliasConsumerEvidence(root, architecture, {
      root: '',
      tsconfigs: {},
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('verified');

    expect(evidence.find(({ consumer }) => consumer === 'package-subpath')).toMatchObject({
      status: 'absent', files: [],
    });
  });
});

describe('aliasConsumerEvidence · static targets', () => {
  it('keeps observed but non-declarative config text unverified', () => {
    write('vite.config.ts', 'const name = \'~app\'; export default {};');

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {},
      viteConfig: { file: 'vite.config.ts', text: 'const name = \'~app\'; export default {};' },
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('unverified');
  });

  it('rejects wrong direct and Jest targets', () => {
    write('vite.config.ts', 'export default { resolve: { alias: { \'~app\': \'/other\' } } };');

    write('package.json', JSON.stringify({
      jest: { moduleNameMapper: { '^~app/(.*)$': '<rootDir>/other/$1' } },
    }));

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {},
      viteConfig: {
        file: 'vite.config.ts',
        text: 'export default { resolve: { alias: { \'~app\': \'/other\' } } };',
      },
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('missing');

    expect(evidence.find(({ consumer }) => consumer === 'test-runner')?.status)
      .toBe('missing');
  });

  it('resolves nested tool roots and exact package subpaths', () => {
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });

    fs.writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({
      imports: { '#app': './src' },
    }));

    const nested = {
      ...architecture,
      sourceRoot: 'apps/web/src',
    };

    const evidence = aliasConsumerEvidence(root, nested, {
      root: 'apps/web',
      tsconfigs: {},
    });

    expect(evidence.find(({ consumer }) => consumer === 'package-subpath')?.status)
      .toBe('verified');
  });
});

describe('aliasConsumerEvidence · tsconfig paths bridge', () => {
  it('verifies an explicit tsconfig-paths bridge against the TypeScript target', () => {
    const text = 'import paths from \'vite-tsconfig-paths\'; '
      + 'export default { plugins: [paths()] };';

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
      },
      viteConfig: { file: 'vite.config.ts', text },
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('verified');
  });

  it('does not accept a commented or unrelated tsconfigPaths call as a bridge', () => {
    const texts = [
      '// tsconfigPaths()\nexport default {};',
      'function tsconfigPaths() {}\nexport default { plugins: [tsconfigPaths()] };',
    ];

    for (const text of texts) {
      const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
        root: '',
        tsconfigs: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: { paths: { '~app/*': ['./src/*'] } },
          }),
        },
        viteConfig: { file: 'vite.config.ts', text },
      });

      expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
        .toBe('missing');
    }
  });

  it('lets a wrong explicit alias override reject a genuine bridge', () => {
    const text = 'import paths from \'vite-tsconfig-paths\'; '
      + 'export default { plugins: [paths()], resolve: { alias: { \'~app\': \'/other\' } } };';

    const evidence = aliasConsumerEvidence(root, { ...architecture, alias: '~app' }, {
      root: '',
      tsconfigs: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
      },
      viteConfig: { file: 'vite.config.ts', text },
    });

    expect(evidence.find(({ consumer }) => consumer === 'bundler-runtime')?.status)
      .toBe('missing');
  });

  it.each(['{ broken', '[]', '{}'])(
    'keeps an unreadable package imports shape unverified: %s',
    (text) => {
      write('package.json', text);

      const evidence = aliasConsumerEvidence(root, architecture, {
        root: '',
        tsconfigs: {},
      });

      expect(evidence.find(({ consumer }) => consumer === 'package-subpath')).toMatchObject({
        status: 'unverified', files: ['package.json'], unreadable: ['package.json'],
      });
    },
  );
});
