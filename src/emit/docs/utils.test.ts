import { describe, expect, it } from 'vitest';

import { escapeCell, formatOwns, injectBetweenMarkers } from './utils';

describe('escapeCell', () => {
  it('escapes pipes and collapses newlines', () => {
    expect(escapeCell('a | b\nc')).toBe('a \\| b c');
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

  it('throws when the markers are out of order', () => {
    expect(() => injectBetweenMarkers('<!-- X:END -->\n<!-- X:START -->', 'X', 'c')).toThrow(
      /out of order/,
    );
  });
});
