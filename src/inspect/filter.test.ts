import { describe, expect, it } from 'vitest';

import { dropTestFiles, globToRegExp, isTestFile } from './filter';
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

  it('isTestFile matches against compiled patterns', () => {
    expect(isTestFile('a/b.test.js', [globToRegExp('**/*.test.js')])).toBe(true);
    expect(isTestFile('a/b.js', [globToRegExp('**/*.test.js')])).toBe(false);
  });
});

describe('globToRegExp · what each star form consumes', () => {
  it('spans zero directories for a slash-terminated double star', () => {
    // `src/**/*.ts` has to match a file sitting directly in src/ as well as one
    // nested below it. Reading the stars as a single-segment `*` breaks the
    // zero-directory case, and layerFiles globs are written in exactly this shape.
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

describe('globToRegExp · an unmatched { is a literal, and the scan terminates', () => {
  // Termination is half of what these pin, and it cannot be written as an
  // assertion. A `{` read as a group with no `}` to close it puts the cursor at
  // -1, the loop's `i++` restarts the scan from the front of the glob, and
  // `pattern` gains a whole segment per pass until V8 aborts on heap exhaustion
  // — the adopter sees a command that never comes back, never a named glob. A
  // synchronous loop never yields, so vitest's timeout cannot fire either: a
  // regression here takes the worker down instead of going red. Accepted, since
  // the alternative is a child-process harness and this repo keeps those in
  // `scripts/`.
  it.each([
    ['src/{a/**', '^src\\/\\{a\\/.*$'],
    ['{', '^\\{$'],
    // Its `}` sits BEFORE the `{` and closes nothing. A guard asking only
    // whether the glob holds a `}` somewhere leaves this one hanging.
    ['a}b{c', '^a\\}b\\{c$'],
    // A balanced pair followed by an unmatched one — the commonest real shape,
    // a truncated second extension list. A guard computed once from the FIRST
    // `{` compiles every other glob in this file byte-identically and still
    // hangs here.
    ['**/*.{test,spec}.{ts', '^(?:.*\\/)?[^/]*\\.(?:test|spec)\\.\\{ts$'],
    // The same shape with nothing between the pair and the stray `{`, which is
    // what makes the guard's start index visible: search from `i - 1` instead of
    // `i` and the `}` that already closed answers for this `{`, while the
    // group's own `indexOf('}', i)` still returns -1 and the cursor walks
    // backwards. Every other glob in this file compiles byte-identically under
    // that edit, so this row is the only thing standing between it and the heap.
    ['{a,b}{c', '^(?:a|b)\\{c$'],
  ])('compiles %s to %s', (glob, source) => {
    expect(globToRegExp(glob).source).toBe(source);
  });

  it('matches the path spelled with the brace, and reads no group into it', () => {
    expect(globToRegExp('src/{a/**').test('src/{a/b.ts')).toBe(true);
    expect(globToRegExp('src/{a/**').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('a}b{c').test('a}b{c')).toBe(true);
  });
});

describe('globToRegExp · every balanced brace compiles where it did', () => {
  // Pinned as `.source`, because a path assertion cannot see the difference. The
  // one-edit repair that reaches for `lastIndexOf('}')` — as the guard and as the
  // group's end — leaves every case above and every `.test(path)` in this file
  // green while compiling `{a}{b}` to `^(?:a\}\{b)$`: two brace groups in one
  // glob is legal and ordinary, and it would start matching other paths silently.
  it.each([
    ['src/{a,b}/**', '^src\\/(?:a|b)\\/.*$'],
    // A group holding a `/`. Legal, and the reason the guard reads the whole
    // tail rather than the segment the `{` sits in: scoping the search to
    // `glob.slice(i).split('/')[0]` — the natural read of "a group cannot cross
    // a directory separator" — leaves every other row in this file untouched
    // while compiling this one to `^src\/\{a,b\/c\}\/.*$`, which matches
    // nothing it used to.
    ['src/{a,b/c}/**', '^src\\/(?:a|b\\/c)\\/.*$'],
    ['**/*.test.{js,ts,vue}', '^(?:.*\\/)?[^/]*\\.test\\.(?:js|ts|vue)$'],
    ['{a}{b}', '^(?:a)(?:b)$'],
    // Nested braces compile to garbage — but they terminate, which makes them a
    // different defect. Pinned so this repair cannot drift into it.
    ['{a,{b,c}}', '^(?:a|\\{b|c)\\}$'],
  ])('compiles %s to %s', (glob, source) => {
    expect(globToRegExp(glob).source).toBe(source);
  });
});
