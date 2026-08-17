import { describe, expect, it } from 'vitest';

import { validateBlueprint } from './defineBlueprint';
import type { Blueprint, OwnedPrimitive } from './types';

/**
 * One case per construct `validateOwnedGlobs` refuses, and one per form it
 * lets through. `filter.eslint.test.ts` is the other half: it measures, against
 * the real linter, why each refused form is refused — this file only checks that
 * the refusal fires and says which construct it fired on.
 */

function owning(owns: OwnedPrimitive[]): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'services', does: 'net', owns },
      ],
    },
  };
}

const reject = (owns: OwnedPrimitive[]) => () => validateBlueprint(owning(owns));

describe('validateBlueprint · a pattern glob states a ban both engines can read', () => {
  it.each([
    ['a character class', 'foo[A-Z]*', /"\[…\]" character class/],
    ['"**" inside a segment', 'a**b', /"\*\*" inside a path segment/],
    ['a leading slash', '/foo', /starts with "\/"/],
    ['a trailing slash', 'foo/', /ends with "\/"/],
    ['a leading negation', '!foo', /starts with "!"/],
    ['a backslash', 'foo\\bar', /contains "\\"/],
    ['a brace group', 'lodash.{merge,pick}', /no brace expansion/],
  ])('refuses %s', (_label, pattern, message) => {
    expect(reject([{ package: pattern, pattern: true }])).toThrow(message);

    // The sentence names the owner, the glob, and what IS supported — a schema
    // error that only said "invalid" would leave the author guessing which.
    expect(reject([{ package: pattern, pattern: true }]))
      .toThrow(/Layer "services" owns .* A pattern glob may use/s);
  });

  it.each([
    'axios',
    'foo*',
    '@scope/*',
    '@scope/**',
    'foo/**',
    'a/**/b',
    'fo?',
    '*',
    '**',
    'node:*',
  ])('accepts %s', (pattern) => {
    expect(reject([{ package: pattern, pattern: true }])).not.toThrow();
  });

  it('leaves a package with no pattern flag alone', () => {
    // The exact-path branch is a string comparison in both engines, so nothing
    // about glob syntax applies to it — `@scope/*` as a literal name is legal,
    // if useless, and refusing it here would be a rule about a matcher that
    // never runs.
    expect(reject([{ package: 'foo[A-Z]*' }])).not.toThrow();
    expect(reject(['foo[A-Z]*'])).not.toThrow();
  });
});

describe('validateBlueprint · an exempt glob names files both engines agree on', () => {
  const exempt = (glob: string): OwnedPrimitive[] => [{ package: 'axios', exempt: [glob] }];

  it.each([
    ['a character class', 'src/[ab].ts', /"\[…\]" character class/],
    ['an extglob', 'src/+(a|b).ts', /"\(…\)", an extglob/],
    ['a nested brace group', 'src/{a,{b,c}}.ts', /nests "\{…\}" groups/],
    ['a brace range', 'src/{a..c}.ts', /"\{a\.\.z\}" range/],
    ['a comma-less brace group', 'src/{a}.ts', /group with no comma/],
    ['an unclosed brace', 'src/{a.ts', /never closed/],
    ['"**" inside a segment', 'src/a**b.ts', /"\*\*" inside a path segment/],
    ['a leading slash', '/src/a.ts', /starts with "\/"/],
    ['a trailing slash', 'src/legacy/', /ends with "\/"/],
    ['a leading negation', '!**/*.test.ts', /starts with "!"/],
    ['a backslash', 'src/\\a.ts', /contains "\\"/],
  ])('refuses %s', (_label, glob, message) => {
    expect(reject(exempt(glob))).toThrow(message);
    expect(reject(exempt(glob))).toThrow(/exempt glob may use/);
  });

  it.each([
    '**/*.test.ts',
    '**/*.{test,spec}.{ts,tsx}',
    'src/legacy/**',
    'src/*.ts',
    '**/*.stories.*',
    'src/x/**/*.ts',
    'src/a?.ts',
  ])('accepts %s', (glob) => {
    expect(reject(exempt(glob))).not.toThrow();
  });

  it('checks every glob in the list, not just the first', () => {
    expect(reject([{ package: 'axios', exempt: ['**/*.test.ts', 'src/[ab].ts'] }]))
      .toThrow(/character class/);
  });
});

describe('validateBlueprint · a module owns globs under the same grammar', () => {
  it('names the module rather than a layer', () => {
    const modular = owning([]);

    modular.architecture.modules = [
      { name: 'App', does: 'shell', owns: [{ package: 'foo[A-Z]*', pattern: true }] },
    ];

    expect(() => validateBlueprint(modular)).toThrow(/Module "App" owns "foo\[A-Z\]\*"/);
  });
});
