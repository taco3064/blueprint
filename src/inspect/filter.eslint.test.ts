import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint, Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fileGlobMatches, groupReaches, ignoresFile } from './filter';

/**
 * All three matchers, measured against the linter itself rather than a table
 * somebody transcribed from the docs.
 *
 * `inspect` now calls the same libraries ESLint calls, so these rows are not
 * checking an approximation — they are the standing proof that the wiring is
 * right, and the reason a row states the ANSWER as well as the agreement: two
 * engines that agree on `false` everywhere would satisfy an agreement-only
 * assertion while banning nothing.
 *
 * The rows that used to be a refusal list are here as ordinary rows. Character
 * classes, extglobs, negation, escapes, braces around wildcards, case and
 * dotfiles are all things ESLint accepts, so blueprint accepts them, and the
 * agreement is measured rather than legislated.
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
  'src/a.gen.ts',
  'src/keep.gen.ts',
  'src/.hidden.ts',
  'src/foo/deep.ts',
  'src/x/b.ts',
  'src/x/d.spec.ts',
  'src/a/x/b.ts',
  'src/legacy/f.ts',
  'src/legacyOld/f.ts',
  'src/vendor/x.ts',
  'src/legacy/g/h.ts',
  '#hash/a.ts',
  // The pair the exempt-then-tests list is read over, jsx because that is the
  // shape the reproduction was filed in.
  'src/components/legacy/Old.test.jsx',
  'src/components/Fresh.test.jsx',
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
      { files: ['**/*.ts', '**/*.TS', '**/*.jsx'], ignores, rules: { 'no-alert': 'error' } },
    ],
  });

  const config = await eslint.calculateConfigForFile(path.join(root, file));

  return (config as { rules?: Record<string, unknown> })?.rules?.['no-alert'] === undefined;
}

/**
 * Whether an entry whose `files` are these globs governs `file`.
 *
 * The second entry is load-bearing rather than scaffolding. ESLint discounts a
 * config whose `files` are ALL "universal" (`*`, a leading `!`, or anything
 * ending `/*` or `/**`) unless some other config matches the same file on a
 * specific pattern — a property of the config ARRAY, not of a glob. The emitted
 * config always carries such entries; a one-entry probe would not, and would
 * report `src/legacy/**` as matching nothing.
 */
async function eslintGoverns(files: string[], file: string): Promise<boolean> {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files, rules: { 'no-alert': 'error' } },
      { files: ['**/*.ts', '**/*.TS'], rules: { 'no-console': 'error' } },
    ],
  });

  const config = await eslint.calculateConfigForFile(path.join(root, file));

  return (config as { rules?: Record<string, unknown> })?.rules?.['no-alert'] !== undefined;
}

describe('groupReaches · agrees with the no-restricted-imports group matcher', () => {
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
    // A character class expands, and the case-insensitivity above still applies
    // over it — so `[A-Z]` reaches a lowercase specifier as well.
    ['foo[A-Z]*', 'fooABC', true],
    ['foo[A-Z]*', 'fooabc', true],
    // `**` inside a segment is not a globstar: it stops at "/".
    ['a**b', 'a/x/b', false],
    ['a**b', 'axyzb', true],
    // A leading "/" anchors to the root of the matched space, and an absolute
    // subject is not a path `ignore` will judge at all (allowRelativePaths).
    ['/foo', 'foo', true],
    ['/foo', '/foo', false],
    // A trailing "/" is gitignore's directory marker: descendants, not the name.
    ['foo/', 'foo/bar', true],
    ['foo/', 'foo', false],
    // A whole group that is one negation re-includes into an empty set, so it
    // reaches nothing — including the literal it is spelled after.
    ['!foo', 'foo', false],
    ['!foo', '!foo', false],
    ['foo\\*', 'foo*', true],
    ['foo\\*', 'fooxyz', true],
    // No brace expansion here — gitignore has none, so the braces are literal.
    ['{a,b}', 'a', false],
    ['{a,b}', '{a,b}', true],
    ['lodash.{merge,pick}', 'lodash.merge', false],
    // A leading "#" is a gitignore COMMENT, so the group is dropped entirely.
    ['#foo', '#foo', false],
    ['#foo', 'foo', false],
    // Dotfiles are ordinary here: gitignore's "*" crosses a leading dot.
    ['foo/*', 'foo/.bar', true],
    ['.*', '.hidden', true],
    // Extglobs belong to minimatch, not to gitignore.
    ['+(a|foo)', 'foo', false],
  ])('%s vs %s', (group, specifier, banned) => {
    expect(eslintBans(group, specifier)).toBe(banned);
    expect(groupReaches([group], specifier)).toBe(banned);
  });

  it('reads a multi-entry group as one ordered gitignore list', () => {
    // `buildPackagePatterns` emits one glob per group today, and the rule adds
    // the whole array to one `ignore` instance — so a later negation inside a
    // group re-includes, exactly as it does in a file `ignores` list.
    const group = ['@scope/*', '!@scope/allowed'];

    expect(groupReaches(group, '@scope/banned')).toBe(true);
    expect(groupReaches(group, '@scope/allowed')).toBe(false);
    // Same group twice — the cached instance answers the same way.
    expect(groupReaches(group, '@scope/banned')).toBe(true);
  });

  it('does not confuse two groups whose entries join to the same text', () => {
    // `ignore` splits a multi-line STRING into rules and keeps a multi-line
    // array ENTRY whole, so these are genuinely two rule sets — and a cache
    // keyed by a newline join would hand the second one the first's answer.
    expect(groupReaches(['a\nb'], 'a')).toBe(false);
    expect(groupReaches(['a', 'b'], 'a')).toBe(true);
  });
});

describe('fileGlobMatches · agrees with the files matcher on one glob', () => {
  it.each([
    ['src/**/*.ts', 'src/a.ts', true],
    ['src/**/*.ts', 'src/foo/deep.ts', true],
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/foo/deep.ts', false],
    // Braces expand here — the difference from the group matcher above — and
    // the wildcards INSIDE a branch keep their meaning.
    ['src/{legacy*,vendor*}/**', 'src/legacy/f.ts', true],
    ['src/{legacy*,vendor*}/**', 'src/legacyOld/f.ts', true],
    ['src/{legacy*,vendor*}/**', 'src/vendor/x.ts', true],
    ['src/{legacy*,vendor*}/**', 'src/x/b.ts', false],
    ['src/[ab].ts', 'src/a.ts', true],
    ['src/[ab].ts', 'src/foo.ts', false],
    ['src/+(a|foo).ts', 'src/foo.ts', true],
    // `dot: true`, so a leading dot is not special.
    ['**/*.ts', 'src/.hidden.ts', true],
    ['src/*.ts', 'src/.hidden.ts', true],
    // A leading "./" is normalized off the pattern before it is matched.
    ['./src/*.ts', 'src/a.ts', true],
    // A leading "#" is a minimatch COMMENT too, so the pattern matches nothing.
    ['#hash/**', '#hash/a.ts', false],
    ['#hash/*.ts', '#hash/a.ts', false],
    // Case-sensitive here, unlike the group matcher.
    ['src/A.TS', 'src/a.ts', false],
    ['src/A.TS', 'src/A.TS', true],
  ])('%s vs %s', async (glob, file, governs) => {
    expect(await eslintGoverns([glob], file)).toBe(governs);
    expect(fileGlobMatches(glob, file)).toBe(governs);
  });

  it('does not model the universal-pattern rule, which is not about one glob', async () => {
    // ESLint discounts a config whose `files` are ALL universal unless another
    // config matches the file specifically. That is a fact about the config
    // ARRAY, and the emitted config always carries the other entries — so
    // `coverage` and doctor's probe picker ask the per-glob question, which is
    // the one this function answers. Stated here because it is the one place
    // a reader could still catch the two engines saying different things.
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [{ files: ['src/legacy/**'], rules: { 'no-alert': 'error' } }],
    });

    const config = await eslint.calculateConfigForFile(path.join(root, 'src/legacy/f.ts'));

    expect((config as { rules?: Record<string, unknown> })?.rules?.['no-alert'])
      .toBeUndefined();

    expect(fileGlobMatches('src/legacy/**', 'src/legacy/f.ts')).toBe(true);
  });
});

describe('ignoresFile · agrees with the ignores matcher on the whole list', () => {
  it.each([
    [['**/*.test.ts'], 'src/a.test.ts', true],
    [['**/*.test.ts'], 'src/a.ts', false],
    // Braces DO expand here — the difference from the group matcher above.
    [['**/*.{test,spec}.ts'], 'src/x/d.spec.ts', true],
    [['src/legacy/**'], 'src/legacy/g/h.ts', true],
    // …and there is no descendant reach: an ignores entry is a file pattern.
    [['src/legacy'], 'src/legacy/f.ts', false],
    [['src/*.ts'], 'src/x/b.ts', false],
    [['src/**'], 'src/foo/deep.ts', true],
    // Case-sensitive here, unlike the group matcher.
    [['src/A.TS'], 'src/a.ts', false],
    [['src/A.TS'], 'src/A.TS', true],
    [['src/foo*'], 'src/foobar.ts', true],
    [['src/foo*'], 'src/foo/deep.ts', false],
    [['**/foo*'], 'src/foo.ts', true],
    [['src/a?.ts'], 'src/ab.ts', true],
    [['src/a?.ts'], 'src/a.ts', false],
    // Every construct the previous approach refused, now measured instead.
    [['src/[ab].ts'], 'src/a.ts', true],
    [['src/[ab].ts'], 'src/foo.ts', false],
    [['src/+(a|foo).ts'], 'src/foo.ts', true],
    [['src/+(a|foo).ts'], 'src/b.ts', false],
    [['src/{a,{b,foo}}.ts'], 'src/foo.ts', true],
    [['src/{a}.ts'], 'src/a.ts', false],
    [['src/a**b.ts'], 'src/a/x/b.ts', false],
    [['/src/a.ts'], 'src/a.ts', false],
    [['src/legacy/'], 'src/legacy/f.ts', false],
    [['./src/*.ts'], 'src/a.ts', true],
    // The braces-around-wildcards case, the one a simplified compiler split on:
    // it escaped the "*" inside each branch while minimatch expands the braces
    // and then honours it, so three files ESLint exempted went unexempted.
    [['src/{legacy*,vendor*}/**'], 'src/legacy/f.ts', true],
    [['src/{legacy*,vendor*}/**'], 'src/legacyOld/f.ts', true],
    [['src/{legacy*,vendor*}/**'], 'src/vendor/x.ts', true],
    [['src/{legacy*,vendor*}/**'], 'src/x/b.ts', false],
    [['src/*.ts'], 'src/.hidden.ts', true],
    [['**/.*.ts'], 'src/.hidden.ts', true],
    [['#hash/**'], '#hash/a.ts', false],
    // The ordering the list exists for: a later "!" re-includes.
    [['**/*.gen.ts', '!src/keep.gen.ts'], 'src/keep.gen.ts', false],
    [['**/*.gen.ts', '!src/keep.gen.ts'], 'src/a.gen.ts', true],
    // …and only a LATER one: a negation reached before anything matched has
    // nothing to re-include, so the order of the same two entries decides.
    [['!src/keep.gen.ts', '**/*.gen.ts'], 'src/keep.gen.ts', true],
    [['**/*.test.ts', '!src/a.test.ts'], 'src/a.test.ts', false],
    // A "!./" negation is normalized to "!" the same way "./" is stripped.
    [['**/*.gen.ts', '!./src/keep.gen.ts'], 'src/keep.gen.ts', false],
    [['**/*.gen.ts', '!./src/keep.gen.ts'], 'src/a.gen.ts', true],
  ])('%s vs %s', async (globs, file, exempt) => {
    expect(await eslintExempts(globs, file)).toBe(exempt);
    expect(ignoresFile(globs, file)).toBe(exempt);
  });

  it('reads the exempt globs and the test globs as ONE list, as the entry does', async () => {
    // The emitted restriction entry carries `[...exempt, ...testGlobs]`, and the
    // halves decide nothing apart. Read alone, the exempt glob calls this file
    // exempt; read as the entry states it, the `!` among the test globs takes
    // the exemption straight back off — and eslint lints the file. Reading the
    // first answer where the second was asked is a false NEGATIVE: a real
    // violation nothing reports.
    const exempt = ['src/components/legacy/**'];
    const tests = ['**/*.test.{js,jsx}', '!src/components/legacy/**'];
    const file = 'src/components/legacy/Old.test.jsx';

    expect(ignoresFile(exempt, file)).toBe(true);
    expect(ignoresFile([...exempt, ...tests], file)).toBe(false);
    expect(await eslintExempts([...exempt, ...tests], file)).toBe(false);

    // …while a test file the negation does not reach stays exempt in both, so
    // the answer is the ordering rather than "negations disable exemptions".
    const beside = 'src/components/Fresh.test.jsx';

    expect(ignoresFile([...exempt, ...tests], beside)).toBe(true);
    expect(await eslintExempts([...exempt, ...tests], beside)).toBe(true);
  });

  it('is not a .some() over the entries, which no ordering can survive', async () => {
    // The list a net's exempt globs compile to reaches ESLint whole, and the
    // proof is that a per-entry test cannot produce this answer: both entries
    // match `src/keep.gen.ts`, so `.some()` says exempt and ESLint says not.
    const list = ['**/*.gen.ts', '!src/keep.gen.ts'];

    expect(list.some((glob) => ignoresFile([glob], 'src/keep.gen.ts'))).toBe(true);
    expect(ignoresFile(list, 'src/keep.gen.ts')).toBe(false);
    expect(await eslintExempts(list, 'src/keep.gen.ts')).toBe(false);
  });
});
