import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  changedLineCount,
  mergeRanges,
  mutationScopes,
  parseChangedRanges,
  sourceAt,
  summarizeMutationReport,
  unacceptableMutants,
} from './mutation-smoke.mjs';

describe('changed-code mutation scope', () => {
  it('keeps only added production TypeScript lines and merges adjacent hunks', () => {
    const diff = [
      '+++ b/src/domain/rule.ts',
      '@@ -4,0 +5,2 @@',
      '@@ -8 +9 @@',
      '+++ b/src/domain/rule.test.ts',
      '@@ -1 +1,20 @@',
      '+++ b/docs/rule.md',
      '@@ -1 +1,8 @@',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
    ].join('\n');

    const ranges = parseChangedRanges(diff);

    expect(ranges).toEqual({ 'src/domain/rule.ts': [[5, 6], [9, 9]] });

    expect(mutationScopes(ranges)).toEqual([
      'src/domain/rule.ts:5-6',
      'src/domain/rule.ts:9-9',
    ]);

    expect(changedLineCount(ranges)).toBe(3);
  });

  it('is invariant to hunk order and duplicate ranges', () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 20 }),
      ), { maxLength: 80 }),
      (hunks) => {
        const ranges = hunks.map(([start, length]) => [start, start + length - 1]);
        const reversedWithDuplicates = [...ranges, ...ranges].reverse();

        expect(mergeRanges(reversedWithDuplicates)).toEqual(mergeRanges(ranges));
      },
    ));
  });
});

describe('mutation diagnostics', () => {
  it('extracts original single-line and multiline forms from Stryker locations', () => {
    const source = 'const value = one +\n  two;\n';

    expect(sourceAt(source, {
      start: { line: 1, column: 14 },
      end: { line: 2, column: 5 },
    })).toBe('one +\n  two');

    expect(sourceAt(source, {
      start: { line: 1, column: 6 },
      end: { line: 1, column: 11 },
    })).toBe('value');

    expect(sourceAt(source, null)).toBeNull();
  });

  it('names each unacceptable mutant with source and runner details', () => {
    const report = {
      files: {
        'src/a.ts': {
          source: 'const answer = true;\n',
          mutants: [{
            status: 'Survived',
            mutatorName: 'BooleanLiteral',
            replacement: 'false',
            statusReason: 'no rejecting assertion',
            location: {
              start: { line: 1, column: 15 },
              end: { line: 1, column: 19 },
            },
          }],
        },
      },
    };

    expect(unacceptableMutants(report)).toEqual([{
      file: 'src/a.ts',
      line: 1,
      column: 15,
      mutator: 'BooleanLiteral',
      status: 'Survived',
      original: 'true',
      replacement: 'false',
      reason: 'no rejecting assertion',
    }]);
  });
});

describe('mutation smoke verdict', () => {
  const report = (...statuses) => ({
    files: {
      'src/a.ts': { mutants: statuses.map((status) => ({ status })) },
    },
  });

  it('accepts only killed or explicitly ignored mutants', () => {
    expect(summarizeMutationReport(report('Killed', 'Ignored'))).toMatchObject({
      passed: true,
      total: 2,
    });
  });

  it('does not call an empty mutation report a pass', () => {
    expect(summarizeMutationReport(report())).toMatchObject({
      passed: false,
      total: 0,
    });
  });

  it.each(['Survived', 'NoCoverage', 'Timeout', 'RuntimeError', 'CompileError'])(
    'rejects %s instead of converting it into a flattering score',
    (status) => {
      expect(summarizeMutationReport(report('Killed', status))).toMatchObject({
        passed: false,
        unacceptable: { [status]: 1 },
      });
    },
  );
});
