import { describe, expect, it } from 'vitest';

import { baselineSummary, parseBaseline, renderBaseline, splitByBaseline } from './baseline';
import type { Finding } from './types';

const finding = (over: Partial<Finding> = {}): Finding => ({
  severity: 'error',
  rule: 'flow-violation',
  path: 'src/components/Btn/Btn.ts',
  message: 'no',
  ...over,
});

describe('splitByBaseline', () => {
  it('suppresses recorded findings, surfaces fresh ones, counts stale entries', () => {
    const recorded = finding();
    const fresh = finding({ path: 'src/components/New/New.ts' });
    const gone = finding({ path: 'src/hooks/old/old.ts' });

    const split = splitByBaseline(
      [recorded, fresh],
      JSON.parse(renderBaseline([recorded, gone])).findings,
    );

    expect(split.fresh).toEqual([fresh]);
    expect(split.suppressed).toBe(1);
    expect(split.stale).toBe(1);
  });
});

describe('renderBaseline / parseBaseline', () => {
  it('round-trips sorted and deduplicated entries', () => {
    const b = finding({ rule: 'a-rule' });
    const a = finding({ rule: 'z-rule' });

    const entries = parseBaseline(renderBaseline([a, b, a]));

    expect(entries).toHaveLength(2);
    expect(entries[0].rule).toBe('a-rule'); // sorted, stable diffs
  });

  it('sorts by key instead of leaving insertion order be', () => {
    // Three entries, already in key order. A comparator that always answers
    // "less than" reverses them — which two entries cannot reveal, because with
    // two the reversal happens to agree with the sorted answer.
    const entries = parseBaseline(renderBaseline([
      finding({ rule: 'a-rule' }),
      finding({ rule: 'm-rule' }),
      finding({ rule: 'z-rule' }),
    ]));

    expect(entries.map((entry) => entry.rule)).toEqual(['a-rule', 'm-rule', 'z-rule']);
  });

  // The baseline file is hand-editable, and every arm of the shape check needs
  // its own malformed document. A check that quietly passes a broken file lets
  // a junk baseline suppress real findings — the failure mode the ratchet
  // exists to prevent.
  it.each([
    ['not JSON at all', '{ nope', /not valid JSON/],
    ['a bare number', '42', /unexpected shape/],
    ['a bare string', '"findings"', /unexpected shape/],
    ['null, which is typeof object', 'null', /unexpected shape/],
    ['an object with no findings key', '{"version":1}', /unexpected shape/],
    ['findings that are not an array', '{"findings":42}', /unexpected shape/],
    ['an entry that is not an object', '{"findings":[42]}', /unexpected shape/],
    ['a null entry', '{"findings":[null]}', /unexpected shape/],
    ['a non-string rule', '{"findings":[{"rule":1,"path":"p","message":"m"}]}', /unexpected shape/],
    ['a non-string path', '{"findings":[{"rule":"r","path":1,"message":"m"}]}', /unexpected shape/],
    ['a non-string message', '{"findings":[{"rule":"r","path":"p","message":1}]}', /unexpected shape/],
    // One good entry beside a broken one: "any entry is broken" and "every
    // entry is broken" agree on a uniform list and part company only here.
    ['a broken entry among valid ones', '{"findings":[{"rule":"r","path":"p","message":"m"},42]}', /unexpected shape/],
  ])('rejects %s', (_label, text, pattern) => {
    expect(() => parseBaseline(text)).toThrow(pattern);
  });

  it('accepts a minimal well-formed document', () => {
    expect(parseBaseline('{"findings":[{"rule":"r","path":"p","message":"m"}]}'))
      .toEqual([{ rule: 'r', path: 'p', message: 'm' }]);
  });
});

describe('baselineSummary', () => {
  it('always reports suppressed; mentions the ratchet only when stale', () => {
    expect(baselineSummary({ fresh: [], suppressed: 3, stale: 0 })).toBe(
      '3 baselined finding(s) suppressed.',
    );

    expect(baselineSummary({ fresh: [], suppressed: 0, stale: 1 })).toContain(
      '1 baseline entry no longer occur',
    );

    expect(baselineSummary({ fresh: [], suppressed: 0, stale: 2 })).toContain(
      '2 baseline entries no longer occur',
    );
  });
});
