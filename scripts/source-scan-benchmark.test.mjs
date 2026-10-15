import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertCountBounds, timingBounds } from './source-scan-benchmark.mjs';
import { CONTROL_PATHS, git, makeFixture, NOISE_ROOTS }
  from './source-scan-benchmark-fixtures.mjs';
import { timingSummary } from './source-scan-benchmark-worker.mjs';

const roots = [];

function fixture(options) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-measurement-test-'));

  roots.push(parent);

  return makeFixture(parent, 'application', options);
}

function fullRecord() {
  return {
    scopeStatus: 'complete', fixture: 'single-package', demand: 'application-scope', inventoryMode: 'git-visible',
    outsidePaths: [...CONTROL_PATHS].sort(),
    outside: { inventoryFiles: 9, readFiles: 8, parsedFiles: 8, testFilesExcluded: 1,
      contributions: { repositoryVisible: 4, explicitConsumerRoot: 3, governedReference: 2 } },
    governed: { inventoryFiles: 1, readFiles: 1, parsedFiles: 1 },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('source scan benchmark contract', () => {
  it('generates tracked, visible, ignored, test and scanner-excluded controls', () => {
    const { root } = fixture();
    const tracked = git(root, 'ls-files').split('\n');
    const visible = git(root, 'ls-files', '--cached', '--others', '--exclude-standard').split('\n');

    expect(tracked).toContain('vendor/tracked.ts');
    expect(tracked).toContain('.claude/worktrees/tracked.ts');
    expect(visible).toContain('scripts/untracked.ts');
    expect(visible).not.toContain('consumer/entry.ts');
    expect(visible).not.toContain('referenced/entry.ts');
    expect(visible).not.toContain('unrelated/local.ts');
    expect(fs.existsSync(path.join(root, 'consumer/ignored.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'node_modules/unreachable.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'consumer/neighbour.ts'))).toBe(true);
  });

  it('places exactly 5000 ignored source files across the five noise populations', () => {
    const { root } = fixture({ noise: true });

    for (const directory of NOISE_ROOTS) {
      expect(fs.readdirSync(path.join(root, directory))).toHaveLength(1000);
    }

    expect(git(root, 'ls-files', '--others', '--exclude-standard')).toBe('scripts/untracked.ts');
  });

  it('keeps large sibling applications and repository noise outside the nested root', () => {
    const { root, repository } = fixture({ nested: true });

    expect(root).toBe(path.join(repository, 'packages/application'));
    expect(fs.readdirSync(path.join(repository, 'packages/sibling/src'))).toHaveLength(5000);

    expect(git(root, 'ls-files', '--others', '--exclude-standard', '--', '.'))
      .toBe('scripts/untracked.ts');
  });

  it('rejects any source-only outside operation', () => {
    const outside = { directoryWalks: 0, inventoryFiles: 0, readFiles: 0, parsedFiles: 0 };
    const record = { demand: 'governed-source', scopeStatus: 'not-requested', outside };

    expect(() => assertCountBounds(record)).not.toThrow();

    for (const key of Object.keys(outside)) {
      expect(() => assertCountBounds({ ...record, outside: { ...outside, [key]: 1 } })).toThrow();
    }
  });

  it('rejects missing controls, duplicate reads, accidental noise and early test parsing', () => {
    expect(() => assertCountBounds(fullRecord())).not.toThrow();
    expect(() => assertCountBounds({ ...fullRecord(), scopeStatus: 'partial' })).toThrow();

    for (const control of CONTROL_PATHS) {
      const record = fullRecord();

      record.outsidePaths = record.outsidePaths.filter((name) => name !== control);
      expect(() => assertCountBounds(record)).toThrow();
    }

    for (const extra of ['vendor/noise/0.ts', 'consumer/ignored.test.ts', CONTROL_PATHS[0]]) {
      const record = fullRecord();

      record.outsidePaths.push(extra);
      expect(() => assertCountBounds(record)).toThrow();
    }

    for (const key of ['readFiles', 'parsedFiles', 'inventoryFiles', 'testFilesExcluded']) {
      const record = fullRecord();

      record.outside[key]++;
      expect(() => assertCountBounds(record)).toThrow();
    }
  });

  it('uses the ten measured samples for median and slowest duration', () => {
    expect(timingSummary([100, 2, 3, 4, 5, 6, 7, 8, 9, 1]))
      .toEqual({ medianMs: 5.5, slowestMs: 100 });
  });

  it.each([10, 1000])('enforces absolute and relative timing allowances at %i ms', (duration) => {
    const records = [];

    for (const revision of ['base', 'candidate']) {
      for (const name of ['single-package', 'single-package-noise', 'clean-blueprint']) {
        for (const demand of ['governed-source', 'application-scope']) {
          records.push({ revision, fixture: name, demand, medianMs: duration });
        }
      }
    }

    const bounds = timingBounds(records);

    expect(bounds.map((bound) => bound.allowanceMs))
      .toEqual([Math.max(duration * 0.1, 25), Math.max(duration * 0.15, 50),
        Math.max(duration * 0.15, 50)]);

    expect(bounds.every((bound) => bound.passed)).toBe(true);

    for (const record of records) {
      if (record.revision === 'candidate'
        && ['single-package-noise', 'clean-blueprint'].includes(record.fixture)) {
        record.medianMs += 2000;
      }
    }

    expect(timingBounds(records).every((bound) => !bound.passed)).toBe(true);
  });
});
