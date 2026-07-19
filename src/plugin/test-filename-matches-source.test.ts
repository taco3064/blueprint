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

  it('flags an orphan test file', () => {
    expect(messages('Ghost.test.ts')).toHaveLength(1);
    expect(messages('Ghost.test.ts')[0]).toContain('"Ghost"');
  });

  it('ignores files that are not test files', () => {
    expect(messages('Dropdown.ts')).toEqual([]);
  });
});
