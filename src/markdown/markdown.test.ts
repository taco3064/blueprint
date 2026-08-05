import { describe, expect, it } from 'vitest';

import { escapeCell, formatOwns, injectBetweenMarkers, table } from './markdown';

describe('escapeCell', () => {
  it('escapes pipes and collapses newlines', () => {
    expect(escapeCell('a | b\nc')).toBe('a \\| b c');
  });

  it('collapses a run of newlines to one space, and trims the edges', () => {
    // A cell has to be one line. A blank line inside the value would widen to
    // several spaces, and whitespace at either edge shifts the whole column.
    expect(escapeCell('a\n\n\nb')).toBe('a b');
    expect(escapeCell('  padded  ')).toBe('padded');
    expect(escapeCell('\ntrailing\n')).toBe('trailing');
  });
});

describe('table', () => {
  it('renders a header, separator, and rows', () => {
    expect(table(['A', 'B'], [['1', '2'], ['3', '4']])).toBe(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |',
    );
  });
});

describe('formatOwns', () => {
  it('returns empty for none', () => {
    expect(formatOwns(undefined)).toBe('');
    expect(formatOwns([])).toBe('');
  });

  it('formats strings, globals, packages, and named imports', () => {
    expect(formatOwns(['axios'])).toBe('`axios`');
    expect(formatOwns([{ global: 'fetch' }])).toBe('global `fetch`');
    expect(formatOwns([{ package: 'react' }])).toBe('`react`');

    expect(formatOwns([{ package: 'react', imports: ['useContext', 'useMemo'] }])).toBe(
      '`react` → `useContext`, `useMemo`',
    );
  });
});

describe('injectBetweenMarkers', () => {
  const src = 'a\n<!-- X:START -->\nold\n<!-- X:END -->\nb';

  it('replaces content between markers, keeping the surroundings', () => {
    const out = injectBetweenMarkers(src, 'X', 'new');

    expect(out).toContain('<!-- X:START -->\nnew\n<!-- X:END -->');
    expect(out.startsWith('a\n')).toBe(true);
    expect(out.endsWith('\nb')).toBe(true);
  });

  it('is stable: re-injecting the same content yields the same result', () => {
    const once = injectBetweenMarkers(src, 'X', 'new');

    expect(injectBetweenMarkers(once, 'X', 'new')).toBe(once);
  });

  it('throws when a marker is missing', () => {
    expect(() => injectBetweenMarkers('no markers here', 'X', 'c')).toThrow(/not found/);
  });

  it('throws when only one of the two markers is there', () => {
    // A source missing BOTH satisfies either check on its own, so the two
    // cover for each other. One-sided sources separate them — and a present
    // END with an absent START otherwise slices from a negative index and
    // returns a mangled document instead of failing.
    expect(() => injectBetweenMarkers('a\n<!-- X:START -->\nb', 'X', 'c')).toThrow(/not found/);
    expect(() => injectBetweenMarkers('a\n<!-- X:END -->\nb', 'X', 'c')).toThrow(/not found/);
  });

  it('accepts a marker that begins one character in', () => {
    // -1 is the sentinel for "absent"; comparing against +1 instead rejects a
    // perfectly good source whose marker starts at index 1.
    const shifted = 'x<!-- X:START -->\nold\n<!-- X:END -->y';

    expect(injectBetweenMarkers(shifted, 'X', 'new'))
      .toBe('x<!-- X:START -->\nnew\n<!-- X:END -->y');
  });

  it('throws when the markers are out of order', () => {
    expect(() => injectBetweenMarkers('<!-- X:END -->\n<!-- X:START -->', 'X', 'c')).toThrow(
      /out of order/,
    );
  });
});
