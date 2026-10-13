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

function messages(filename: string, options?: Record<string, unknown>): string[] {
  // The temp fixtures live outside the repo — scope the linter's cwd to them.
  return new Linter({ configType: 'flat', cwd: root })
    .verify('export {};', {
      files: ['**/*.{js,ts,jsx,tsx}'],
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/test-filename-matches-source': options ? ['error', options] : 'error' },
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

describe('classified test suites', () => {
  const suiteRoots = [
    { directory: 'test/integration', kind: 'integration' },
    { directory: 'test/contracts', kind: 'contract' },
    { directory: 'e2e/specs', kind: 'e2e' },
  ];

  beforeEach(() => {
    for (const { directory } of suiteRoots) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
  });

  it.each(suiteRoots)('accepts explicit $kind suffix', ({ directory, kind }) => {
    expect(messages(`${directory}/journey.${kind}.test.ts`, { suiteRoots })).toEqual([]);
    expect(messages(`${directory}/journey.${kind}.spec.tsx`, { suiteRoots })).toEqual([]);
  });

  it.each(['journey.test.ts', 'journey.contract.test.ts', '.integration.test.ts'])(
    'rejects an incorrect or empty suite name: %s', (filename) => {
      const found = messages(`test/integration/${filename}`, { suiteRoots });

      expect(found).toHaveLength(1);
      expect(found[0]).toContain('.integration.test or .integration.spec');
    },
  );

  it('does not waive suite naming even for a same-named sibling', () => {
    fs.writeFileSync(path.join(root, 'test/integration/journey.ts'), '');
    expect(messages('test/integration/journey.test.ts', { suiteRoots })).toHaveLength(1);
  });

  it.each(['test/integration-extra', 'test/Integration', 'other'])(
    'does not admit orphan suites in %s', (directory) => {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      expect(messages(`${directory}/journey.integration.test.ts`, { suiteRoots })).toHaveLength(1);
    },
  );

  it('accepts a legitimate same-named source outside suite roots', () => {
    fs.writeFileSync(path.join(root, 'journey.integration.ts'), '');
    expect(messages('journey.integration.test.ts', { suiteRoots })).toEqual([]);
  });

  it('uses the most specific declared root regardless of declaration order', () => {
    const nested = { directory: 'test/integration/browser', kind: 'e2e' };

    fs.mkdirSync(path.join(root, nested.directory));

    for (const roots of [[...suiteRoots, nested], [nested, ...suiteRoots]]) {
      expect(messages(`${nested.directory}/journey.e2e.test.ts`, { suiteRoots: roots })).toEqual([]);

      expect(messages(`${nested.directory}/journey.integration.test.ts`, {
        suiteRoots: roots,
      })).toHaveLength(1);
    }
  });

  it.each([
    '', '/', '../test', 'test/../other', './test', 'test/./other',
    'C:/test', 'test/', 'test//other', 'test\\other',
  ])(
    'rejects invalid suite root %s', (directory) => {
      expect(() => messages('journey.test.ts', {
        suiteRoots: [{ directory, kind: 'integration' }],
      })).toThrow();
    },
  );

  it.each([
    { allowAspectSuffix: 'yes' },
    { suiteRoots: [{ directory: 'test', kind: 'unit' }] },
    { suiteRoots: [{ directory: 'test' }] },
    { allowEverything: true },
  ])('rejects invalid rule options %j', (options) => {
    expect(() => messages('journey.test.ts', options)).toThrow();
  });
});

describe('source sibling identity', () => {
  it('only allows aspect names when enabled', () => {
    fs.writeFileSync(path.join(root, 'Widget.ts'), '');
    expect(messages('Widget.smoke.test.ts')).toHaveLength(1);
    expect(messages('Widget.smoke.test.ts', { allowAspectSuffix: true })).toEqual([]);
    expect(messages('Widget.browser.smoke.test.ts', { allowAspectSuffix: true })).toEqual([]);
    expect(messages('Other.smoke.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
  });

  it('prefers the complete basename and supports dotted source names', () => {
    fs.writeFileSync(path.join(root, 'Widget.browser.ts'), '');
    expect(messages('Widget.browser.test.ts', { allowAspectSuffix: true })).toEqual([]);
    expect(messages('Widget.browser.smoke.test.ts', { allowAspectSuffix: true })).toEqual([]);
  });

  it('requires a regular file and case precise name', () => {
    fs.mkdirSync(path.join(root, 'Widget.ts'));
    expect(messages('Widget.test.ts')).toHaveLength(1);
    fs.writeFileSync(path.join(root, 'widget.js'), '');
    expect(messages('Widget.test.ts')).toHaveLength(1);
  });

  it('reports a missing source directory without crashing', () => {
    expect(messages('missing/Ghost.test.ts')).toHaveLength(1);
  });

  it('rejects an empty source name', () => {
    expect(messages('.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
  });

  it('does not interpret a leading dot as an aspect separator', () => {
    expect(messages('.hidden.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
  });
});

it('does not invent a partial name after exhausting a basename without separators', () => {
  fs.writeFileSync(path.join(root, 'Car.ts'), '');

  expect(messages('Card.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
});

it('never matches an empty source basename for hidden or empty test basenames', () => {
  fs.writeFileSync(path.join(root, '.ts'), '');

  expect(messages('.Card.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
  expect(messages('.test.ts', { allowAspectSuffix: true })).toHaveLength(1);
});
