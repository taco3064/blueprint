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
    expect(dropTestFiles(scan, undefined).files.map((f) => f.path)).toEqual(['src/services/api.js']);

    // Override: only *.spec.* counts as a test file.
    expect(dropTestFiles(scan, '**/*.spec.ts').files).toHaveLength(2);
  });

  it('isTestFile matches against compiled patterns', () => {
    expect(isTestFile('a/b.test.js', [globToRegExp('**/*.test.js')])).toBe(true);
    expect(isTestFile('a/b.js', [globToRegExp('**/*.test.js')])).toBe(false);
  });
});
