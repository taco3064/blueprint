import { describe, expect, it } from 'vitest';

import { dropTestFiles, globToRegExp, ignoresFile } from './filter';
import type { ScanResult } from './types';

describe('globToRegExp', () => {
  it('handles ** spans, single stars, braces, and ? — anchored', () => {
    const test = globToRegExp('**/*.test.{js,ts,vue}');

    expect(test.test('src/services/api.test.js')).toBe(true);
    expect(test.test('deep/ly/nested/x.test.vue')).toBe(true);
    expect(test.test('top.test.ts')).toBe(true);
    expect(test.test('src/services/api.js')).toBe(false);
    expect(test.test('src/api.test.jsx')).toBe(false); // brace is exact

    expect(globToRegExp('src/*/x.js').test('src/a/x.js')).toBe(true);
    expect(globToRegExp('src/*/x.js').test('src/a/b/x.js')).toBe(false); // * stops at /
    expect(globToRegExp('x.?s').test('x.ts')).toBe(true);
    expect(globToRegExp('a.b').test('aXb')).toBe(false); // dot escaped
    expect(globToRegExp('**').test('anything/at/all.js')).toBe(true);
  });

  it('escapes by prefixing the metacharacter, not by replacing it', () => {
    // `$&` means "backslash, then whatever matched"; a `split`/`join` drops the
    // character instead, and `a.b` compiles to `^a\b$` — a valid regex meaning
    // word-boundary, answering about a different set of files without throwing.
    // Three cases in this file already redden on that flatten, but sideways:
    // one throws `Unmatched ')'` out of a brace body, two fail on `**/` spans.
    // What is asked only here is the class itself, one contract per member —
    // dropping `+` from it reddens this case and nothing else in the suite,
    // while dropping `.` reddens only the negative `aXb` line above, because a
    // positive can never catch an unescaped `.`.
    expect(globToRegExp('a.b').test('a.b')).toBe(true);
    expect(globToRegExp('src/x+y.js').test('src/x+y.js')).toBe(true);
  });
});

describe('dropTestFiles', () => {
  const scan: ScanResult = {
    topDirs: ['services'],
    files: [
      { path: 'src/services/api.js', segments: ['services', 'api.js'], imports: [] },
      { path: 'src/services/api.test.js', segments: ['services', 'api.test.js'], imports: [] },
      { path: 'src/services/api.spec.ts', segments: ['services', 'api.spec.ts'], imports: [] },
    ],
  };

  it('drops defaults, keeps sources, honors overrides', () => {
    expect(
      dropTestFiles(scan, undefined).files.map((f) => f.path),
    ).toEqual(['src/services/api.js']);

    // Override: only *.spec.* counts as a test file.
    expect(dropTestFiles(scan, '**/*.spec.ts').files).toHaveLength(2);
  });

  it('honors a negation in testFiles, because the emitted ignores does', () => {
    // `testFiles` is written verbatim into every net's `ignores`, where a later
    // "!" re-includes. Read as a set of independent globs this file would be
    // dropped from the scan while ESLint kept linting it.
    const kept = dropTestFiles(scan, ['**/*.test.js', '!src/services/api.test.js']);

    expect(kept.files.map((f) => f.path)).toContain('src/services/api.test.js');
  });
});

describe('ignoresFile · the compiled matchers are reused, not rebuilt', () => {
  it('answers the same on a second call with the same list', () => {
    // Both minimatch caches are exercised here: the plain pattern on the first
    // entry, and — only because the first entry already matched — the negated
    // one on the second. A cache that returned a differently-configured matcher
    // for a repeat pattern would answer differently the second time.
    const list = ['**/*.gen.ts', '!src/keep.gen.ts'];

    expect(ignoresFile(list, 'src/keep.gen.ts')).toBe(false);
    expect(ignoresFile(list, 'src/keep.gen.ts')).toBe(false);
    expect(ignoresFile(list, 'src/a.gen.ts')).toBe(true);
    expect(ignoresFile(list, 'src/a.gen.ts')).toBe(true);
  });
});

describe('globToRegExp · what each star form consumes', () => {
  it('spans zero directories for a slash-terminated double star', () => {
    // `src/**/*.ts` has to match a file sitting directly in src/ as well as one
    // nested below it. Reading the stars as a single-segment `*` breaks the
    // zero-directory case, and a `.gitignore` line is written in this shape.
    const net = globToRegExp('src/**/*.ts');

    expect(net.test('src/a.ts')).toBe(true);
    expect(net.test('src/sub/deep/a.ts')).toBe(true);
  });

  it('requires a directory boundary where the glob wrote one', () => {
    // `**/` spans whole directories, not arbitrary characters. Dropping the
    // boundary makes `src/**/a.ts` match `src/xa.ts` — a file that is not in a
    // subdirectory at all, and not named what the glob asked for.
    const net = globToRegExp('src/**/a.ts');

    expect(net.test('src/a.ts')).toBe(true);
    expect(net.test('src/sub/a.ts')).toBe(true);
    expect(net.test('src/xa.ts')).toBe(false);
  });

  it('keeps the character that follows a bare double star', () => {
    // `a**b` has no slash after the stars, so they mean "anything" and the `b`
    // stays part of the pattern. Consuming one character too many drops it, and
    // the glob then matches everything that merely starts with `a`.
    const net = globToRegExp('a**b');

    expect(net.test('axyzb')).toBe(true);
    expect(net.test('axyzc')).toBe(false);
  });
});
