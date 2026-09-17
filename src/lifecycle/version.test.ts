import { describe, expect, it } from 'vitest';

import { compareVersions, isVersion } from './version';

describe('lifecycle versions', () => {
  it.each([
    '0.0.0', '3.2.0', '4.1.0', '10.20.30', '4.1.0-next.0', '1.0.0-alpha-1.beta',
  ])('accepts %s', (value) => {
    expect(isVersion(value)).toBe(true);
  });

  it.each([
    '4.1', '04.1.0', '4.1.0-', 'v4.1.0', '4.1.0+build', '', 4, null,
  ])('rejects %s', (value) => {
    expect(isVersion(value)).toBe(false);
  });

  it.each([
    ['3.2.0', '4.0.0', -1],
    ['4.0.0', '3.2.0', 1],
    ['4.1.0', '4.1.0', 0],
    ['4.0.9', '4.1.0', -1],
    ['4.1.1', '4.1.0', 1],
    ['10.0.0', '9.9.9', 1],
    ['4.1.0-next.0', '4.1.0', -1],
    ['4.1.0', '4.1.0-next.0', 1],
    ['4.1.0-next.1', '4.1.0-next.0', 1],
    ['4.1.0-next.2', '4.1.0-next.10', -1],
    ['4.1.0-1', '4.1.0-alpha', -1],
    ['4.1.0-alpha', '4.1.0-1', 1],
    ['4.1.0-alpha', '4.1.0-beta', -1],
    ['4.1.0-beta', '4.1.0-alpha', 1],
    ['4.1.0-alpha', '4.1.0-alpha.1', -1],
    ['4.1.0-alpha.1', '4.1.0-alpha', 1],
    ['4.1.0-alpha.1', '4.1.0-alpha.1', 0],
  ] as const)('compares %s with %s as %i', (left, right, order) => {
    expect(compareVersions(left, right)).toBe(order);
  });

  it('refuses to order a value that is not a version', () => {
    expect(() => compareVersions('4.1', '4.1.0')).toThrow(RangeError);
  });
});
