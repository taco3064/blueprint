import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plugin } from './plugin';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-testname-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function messages(filename: string): string[] {
  // The temp fixtures live outside the repo — scope the linter's cwd to them.
  return new Linter({ configType: 'flat', cwd: root })
    .verify('export {};', {
      files: ['**/*.{js,ts,jsx,tsx}'],
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/test-filename-matches-source': 'error' },
    }, { filename: path.join(root, filename) })
    .map((message) => message.message);
}

describe('blueprint/test-filename-matches-source', () => {
  it('passes a test file with a co-located same-named source', () => {
    fs.writeFileSync(path.join(root, 'Dropdown.ts'), '');

    expect(messages('Dropdown.test.ts')).toEqual([]);
  });

  it('matches any source extension, and both test/spec suffixes', () => {
    fs.writeFileSync(path.join(root, 'Card.vue'), '');

    expect(messages('Card.test.ts')).toEqual([]);
    expect(messages('Card.spec.ts')).toEqual([]);
  });

  // One extension used to stand in for the whole list, so the other five could
  // be dropped with the suite green — and a dropped extension makes every test
  // beside a source of that kind an orphan. `.ts` and `.vue` were covered above;
  // these are the rest, each its own contract.
  it.each(['.js', '.jsx', '.tsx', '.mjs'])('accepts a sibling source ending %s', (ext) => {
    fs.writeFileSync(path.join(root, `Widget${ext}`), '');

    expect(messages('Widget.test.ts')).toEqual([]);
  });

  it('flags an orphan test file', () => {
    expect(messages('Ghost.test.ts')).toHaveLength(1);
    expect(messages('Ghost.test.ts')[0]).toContain('"Ghost"');

    // Naming the orphan is the diagnosis; the remedy is the half the reader can
    // act on, and it says BOTH things they have to get right — where the file
    // goes, and what it has to be called.
    expect(messages('Ghost.test.ts')[0])
      .toContain('co-locate the test next to its source and keep the names aligned');
  });

  it('ignores files that are not test files', () => {
    expect(messages('Dropdown.ts')).toEqual([]);
  });

  it('reads the test suffix at the end of the path, not inside a directory name', () => {
    // A directory named `a.test.ts` is not a test file. Matching the suffix
    // mid-path turns every file underneath it into an orphan test whose
    // "missing source" is a sibling that was never supposed to exist.
    fs.mkdirSync(path.join(root, 'a.test.ts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a.test.ts', 'b.ts'), 'export {};');

    expect(messages('a.test.ts/b.ts')).toEqual([]);
  });
});
