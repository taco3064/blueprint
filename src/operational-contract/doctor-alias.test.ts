import { describe, expect, it } from 'vitest';

import { renderAliasConsumer } from './doctor-alias';

const VALUE_FORMS = '`\'<alias>\': <value>` or `.set(\'<alias>\', <value>)` whose '
  + '<value> is `\'<dir>\'`, `fileURLToPath(new URL(\'<dir>\', import.meta.url))`, or '
  + '`path.resolve(__dirname, \'<dir>\')` (also bare `resolve`)';

const PROVABLE_FORMS = {
  typescript: '`compilerOptions.paths` entries in a tsconfig that parses',
  'bundler-runtime': `${VALUE_FORMS}, or a called \`vite-tsconfig-paths\` plugin whose `
    + '`compilerOptions.paths` match',
  'package-subpath': 'string `imports` entries (`"<alias>/*": "<dir>/*"`) in package.json',
  'test-runner': `${VALUE_FORMS}, or a string Jest \`moduleNameMapper\` target`,
} as const;

describe('renderAliasConsumer', () => {
  it('retains consumer evidence as structural JSON fields', () => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: 'typescript',
        status: 'verified',
        aliases: ['~app'],
        files: ['tsconfig.json'],
      },
    })).toEqual({
      label: 'import alias · typescript',
      ok: true,
      consumer: 'typescript',
      status: 'verified',
      aliases: ['~app'],
      files: ['tsconfig.json'],
    });
  });

  it.each([
    ['.', './*'],
    ['src', './src/*'],
  ])('renders the missing TypeScript alias relative to %s', (sourceRoot, target) => {
    const result = renderAliasConsumer({
      sourceRoot,
      evidence: {
        consumer: 'typescript', status: 'missing', aliases: ['~app'], files: ['tsconfig.json'],
      },
    });

    expect(result.detail).toBe(`"~app" is missing — declare compilerOptions.paths ("~app/*": ["${target}"])`);
    expect(result.ok).toBe(false);
  });

  it('explains non-applicability without implying unreadable configuration', () => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: 'package-subpath', status: 'not-applicable', aliases: ['~app'], files: [],
      },
    })).toEqual({
      label: 'import alias · package-subpath',
      ok: true,
      detail: 'the configured aliases are not package # subpaths',
      consumer: 'package-subpath', status: 'not-applicable', aliases: ['~app'], files: [],
    });
  });

  it('reports an absent consumer as a passing detail, not a skip', () => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: 'bundler-runtime', status: 'absent', aliases: ['~app'], files: [],
      },
    })).toEqual({
      label: 'import alias · bundler-runtime',
      ok: true,
      detail: 'no recognised bundler-runtime configuration is present',
      consumer: 'bundler-runtime', status: 'absent', aliases: ['~app'], files: [],
    });
  });

  it('distinguishes a missing declaration from evidence that cannot be verified', () => {
    const missing = renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: 'bundler-runtime',
        status: 'missing',
        aliases: ['~app'],
        files: ['vite.config.ts'],
      },
    });

    const unknown = renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: 'test-runner',
        status: 'unverified',
        aliases: ['~app'],
        files: ['vitest.config.ts'],
        unreadable: ['vitest.config.ts'],
      },
    });

    expect(missing).toMatchObject({ ok: false, status: 'missing' });

    expect(missing.detail).toBe(
      '"~app" is missing — declare "~app" in the recognised bundler-runtime configuration',
    );

    expect(unknown).toMatchObject({ ok: true, status: 'unverified' });
    expect(unknown.skipped).toContain('could not be read statically');
  });
});

describe('renderAliasConsumer · an unverified leg names its reading and provable forms', () => {
  it.each([
    ['typescript', ['tsconfig.json'], ['tsconfig.json', 'tsconfig.app.json']],
    ['bundler-runtime', ['vite.config.ts', 'webpack.config.js'], ['vite.config.ts']],
  ] as const)('names every unreadable %s file', (consumer, files, unreadable) => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer, status: 'unverified', aliases: ['~app'], files: [...files],
        unreadable: [...unreadable],
      },
    }).skipped).toBe(`${unreadable.join(', ')} could not be read statically — this check `
      + `proves only ${PROVABLE_FORMS[consumer]}`);
  });

  it.each([
    ['bundler-runtime', ['vite', 'webpack']],
    ['test-runner', ['vitest']],
  ] as const)('says no %s configuration file was found', (consumer, installed) => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer, status: 'unverified', aliases: ['~app'], files: ['apps/web/package.json'],
        installed: [...installed],
      },
    })).toMatchObject({
      ok: true,
      files: ['apps/web/package.json'],
      skipped: `apps/web/package.json lists ${installed.join(', ')}, but no ${consumer} `
        + `configuration file was found — this check proves only ${PROVABLE_FORMS[consumer]}`,
    });
  });

  it.each([
    ['bundler-runtime', ['vite.config.ts']],
    ['package-subpath', ['package.json']],
    ['test-runner', ['vite.config.ts', 'package.json#jest']],
  ] as const)('names the %s files it read without proving every alias', (consumer, files) => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: { consumer, status: 'unverified', aliases: ['~app', '#other'], files: [...files] },
    }).skipped).toBe(`read ${files.join(', ')}, but not every alias is declared there in a `
      + `form this check can prove — this check proves only ${PROVABLE_FORMS[consumer]}`);
  });

  it.each(Object.entries(PROVABLE_FORMS))('states the forms the %s leg can prove', (
    consumer,
    forms,
  ) => {
    expect(renderAliasConsumer({
      sourceRoot: 'src',
      evidence: {
        consumer: consumer as keyof typeof PROVABLE_FORMS,
        status: 'unverified',
        aliases: ['~app'],
        files: [],
      },
    }).skipped).toBe(`no ${consumer} configuration file was found — this check proves only `
      + forms);
  });
});
