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

  it('rejects invalid JSON and unexpected shapes', () => {
    expect(() => parseBaseline('{ nope')).toThrow(/not valid JSON/);
    expect(() => parseBaseline('{"version":1}')).toThrow(/unexpected shape/);
    expect(() => parseBaseline('{"findings":[{"rule":1}]}')).toThrow(/unexpected shape/);
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
