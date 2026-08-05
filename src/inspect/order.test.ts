import { describe, expect, it } from 'vitest';

import { compareText } from './order';

describe('compareText', () => {
  it('orders by code unit and answers 0 for equal input', () => {
    expect(compareText('a', 'b')).toBe(-1);
    expect(compareText('b', 'a')).toBe(1);

    // The whole reason this is a function. At every call site the keys are unique
    // — directory entries, Map keys — so `a < b ? -1 : 1` and `a <= b ? -1 : 1`
    // produce identical orders there and no test can tell a comparator from a
    // coin flip. Asked directly, it has one right answer.
    expect(compareText('same', 'same')).toBe(0);
  });

  it('reads upper case below lower case, not alongside it', () => {
    // Code-unit order, not locale collation: `localeCompare` with no locale
    // argument reads the environment's, so two machines would order the same
    // findings differently — and the point of these lists is that they diff.
    expect(compareText('Zebra', 'apple')).toBe(-1);
  });
});
