import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint, Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { globToRegExp, packageGlobToRegExp } from './filter';

/**
 * Both compilers, measured against the linter itself rather than a table
 * somebody transcribed from the docs.
 *
 * `owns` reaches ESLint through two libraries with different grammars — a
 * `pattern: true` package becomes a `no-restricted-imports` group (the `ignore`
 * package, gitignore semantics, `ignorecase` on by default) and an `exempt`
 * glob becomes a config entry's `ignores` (minimatch, anchored, case-sensitive)
 * — so each half asks the real one and compares. A row states the answer as
 * well as the agreement: two engines that agree on `false` everywhere would
 * satisfy an agreement-only assertion while banning nothing.
 *
 * The disagreement blocks are the other half of the same contract: they are the
 * forms `validateOwns` refuses, and this is the measurement that says why.
 */

const linter = new Linter();

/** What ESLint answers for one `no-restricted-imports` group and one specifier. */
function eslintBans(group: string, specifier: string): boolean {
  return linter.verify(
    `import x from ${JSON.stringify(specifier)};\n`,
    [{
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: {
        'no-restricted-imports': ['error', { patterns: [{ group: [group], message: 'x' }] }],
      },
    }],
    'probe.js',
  ).length > 0;
}

/** Every path either half of the suite asks about, so one temp tree serves both. */
const FILES = [
  'src/a.ts',
  'src/A.TS',
  'src/ab.ts',
  'src/b.ts',
  'src/foo.ts',
  'src/foobar.ts',
  'src/a.test.ts',
  'src/foo/deep.ts',
  'src/x/b.ts',
  'src/x/d.spec.ts',
  'src/a/x/b.ts',
  'src/legacy/f.ts',
  'src/legacy/g/h.ts',
];

let root = '';

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-glob-'));

  for (const file of FILES) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'export const x = 1;\n');
  }
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Whether ESLint's own file matcher exempts `file` from an entry carrying these
 * `ignores` — the shape `emitLint` writes for a net with any exempt glob.
 * Resolution only, exactly as the emitted config is read: an entry that did not
 * apply left its marker rule out.
 */
async function eslintExempts(ignores: string[], file: string): Promise<boolean> {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts', '**/*.TS'], ignores, rules: { 'no-alert': 'error' } },
    ],
  });

  const config = await eslint.calculateConfigForFile(path.join(root, file));

  return (config as { rules?: Record<string, unknown> })?.rules?.['no-alert'] === undefined;
}

describe('packageGlobToRegExp · agrees with the group matcher on every accepted form', () => {
  it.each([
    ['axios', 'axios', true],
    // `ignorecase: !caseSensitive`, and the rule defaults `caseSensitive` to false.
    ['axios', 'AXIOS', true],
    ['axios', 'axios-retry', false],
    ['foo*', 'fooxyz', true],
    ['foo*', 'FOOxyz', true],
    // A group with no "/" is unanchored — gitignore matches it at any segment.
    ['foo*', '@scope/foo', true],
    ['foo*', 'barlower', false],
    ['FOO*', 'fooxyz', true],
    ['@scope/*', '@scope/foo', true],
    // …and a match reaches everything under it.
    ['@scope/*', '@scope/foo/bar', true],
    ['@scope/*', '@Scope/Foo', true],
    ['@scope/*', '@other/foo', false],
    ['@scope/**', '@scope/foo/bar', true],
    ['foo/**', 'foo/bar', true],
    ['foo/**', 'foo', false],
    ['fo?', 'foo', true],
    ['fo?', 'fooa', false],
    ['**/foo', 'x/y/foo', true],
    ['a/**/b', 'a/b', true],
    ['a/**/b', 'a/x/b', true],
    ['a/*/b', 'a/x/b', true],
    ['a/*/b', 'a/x/y/b', false],
    ['*', 'a/b', true],
    ['**', 'a/b', true],
    ['node:*', 'node:fs', true],
    ['@*/foo', '@other/foo', true],
  ])('%s vs %s', (group, specifier, banned) => {
    expect(eslintBans(group, specifier)).toBe(banned);
    expect(packageGlobToRegExp(group).test(specifier)).toBe(banned);
  });

  it.each([
    // Each row is one construct `validateOwns` refuses on a `pattern` glob, and
    // the specifier the two engines part company on.
    ['foo[A-Z]*', 'fooABC'],
    ['a**b', 'a/x/b'],
    ['/foo', 'foo'],
    ['foo/', 'foo/bar'],
    ['!foo', '!foo'],
    ['foo\\', 'foo\\'],
  ])('and disagrees on %s, which validation refuses', (group, specifier) => {
    expect(eslintBans(group, specifier)).not.toBe(packageGlobToRegExp(group).test(specifier));
  });

  it('bans a literal specifier for a brace group, which is why validation refuses it', () => {
    // Not a disagreement — gitignore has no brace expansion, so both engines ban
    // the three characters. Nothing is published under that name, so the
    // declaration is dead rather than wrong, and dead is what is refused.
    expect(eslintBans('{a,b}', 'a')).toBe(false);
    expect(packageGlobToRegExp('{a,b}').test('a')).toBe(false);
    expect(eslintBans('{a,b}', '{a,b}')).toBe(true);
    expect(packageGlobToRegExp('{a,b}').test('{a,b}')).toBe(true);
  });
});

describe('globToRegExp · agrees with the file matcher on every accepted exempt form', () => {
  it.each([
    ['**/*.test.ts', 'src/a.test.ts', true],
    ['**/*.test.ts', 'src/a.ts', false],
    // Braces DO expand here — the difference from the group matcher above.
    ['**/*.{test,spec}.ts', 'src/x/d.spec.ts', true],
    ['src/legacy/**', 'src/legacy/g/h.ts', true],
    // …and there is no descendant reach: an ignores entry is a file pattern.
    ['src/legacy', 'src/legacy/f.ts', false],
    ['src/*.ts', 'src/x/b.ts', false],
    ['src/**', 'src/foo/deep.ts', true],
    // Case-sensitive here, unlike the group matcher.
    ['src/A.TS', 'src/a.ts', false],
    ['src/A.TS', 'src/A.TS', true],
    ['src/foo*', 'src/foobar.ts', true],
    ['src/foo*', 'src/foo/deep.ts', false],
    ['**/foo*', 'src/foo.ts', true],
    ['src/a?.ts', 'src/ab.ts', true],
    ['src/a?.ts', 'src/a.ts', false],
  ])('%s vs %s', async (glob, file, exempt) => {
    expect(await eslintExempts([glob], file)).toBe(exempt);
    expect(globToRegExp(glob).test(file)).toBe(exempt);
  });

  it.each([
    // One construct `validateOwns` refuses on an `exempt` glob per row.
    ['src/[ab].ts', 'src/a.ts'],
    ['src/\\a.ts', 'src/a.ts'],
    ['src/{a}.ts', 'src/a.ts'],
    ['src/{a,{b,foo}}.ts', 'src/foo.ts'],
    ['src/+(a|foo).ts', 'src/foo.ts'],
    ['src/{a..c}.ts', 'src/b.ts'],
    ['src/a**b.ts', 'src/a/x/b.ts'],
  ])('and disagrees on %s, which validation refuses', async (glob, file) => {
    expect(await eslintExempts([glob], file)).not.toBe(globToRegExp(glob).test(file));
  });

  it('re-includes through a "!" entry, which is why validation refuses one', async () => {
    // The emitted entry carries every exempt glob AND the test globs in one
    // `ignores` list, so a negation among them cancels an exemption the list
    // already granted. `activeRules` reads the list as "any glob matches", which
    // has no way to express that.
    const list = ['**/*.test.ts', '!src/a.test.ts'];

    expect(await eslintExempts(list, 'src/a.test.ts')).toBe(false);
    expect(list.some((glob) => globToRegExp(glob).test('src/a.test.ts'))).toBe(true);
  });
});
