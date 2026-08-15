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
    expect(dropTestFiles(scan, undefined).files.map((f) => f.path))
      .toEqual(['src/services/api.js']);

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
