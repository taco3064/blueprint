import { describe, expect, it } from 'vitest';

import { assertContained, escapesRoot } from './contain';
import type { Action } from './types';

describe('escapesRoot', () => {
  // Each row is a shape a config can literally produce, and the verdict is the
  // whole contract — a predicate that answers false for one of the escaping rows
  // is the 0.x behaviour where `emit.handbook: '../HANDBOOK.md'` wrote one
  // directory up and the run said ✓.
  const cases: [string, boolean][] = [
    ['docs/architecture-handbook.md', false],
    ['CLAUDE.md', false],
    ['./CLAUDE.md', false],
    ['src/pages', false],
    ['docs/../CLAUDE.md', false],
    ['.gitignore', false],
    // A path containing `..` that stays inside is not an escape — the check is
    // about where it lands, not about which characters it spells that with.
    ['a/b/../../a/CLAUDE.md', false],
    ['../CLAUDE.md', true],
    ['..', true],
    ['../../outside.md', true],
    ['docs/../../outside.md', true],
    ['/etc/outside.md', true],
    ['/', true],
    // Windows shapes. Judged on posix too, because a config is portable and a
    // boundary that only holds on the platform that ran the test is not one.
    ['C:\\outside.md', true],
    ['\\outside.md', true],
    ['..\\outside.md', true],
    ['docs\\..\\..\\outside.md', true],
  ];

  it.each(cases)('%s → escapes: %s', (target, expected) => {
    expect(escapesRoot(target)).toBe(expected);
  });
});

describe('assertContained', () => {
  const contained: Action[] = [
    { kind: 'write', path: 'blueprint.config.mjs', content: '// x', note: 'config' },
    { kind: 'mkdir', path: 'src/pages', note: 'src/pages/' },
    { kind: 'rm', path: 'CLAUDE.md', note: 'stale' },
    { kind: 'install', command: 'npm i -D eslint', note: 'eslint' },
    { kind: 'instruct', note: 'set the alias' },
  ];

  it('passes a list that stays inside the root', () => {
    expect(() => assertContained(contained)).not.toThrow();
  });

  // Every path-carrying kind, because membership is `'path' in action`: a kind
  // left out of the check writes outside while the other two are guarded.
  it.each([
    ['write', { kind: 'write', path: '../outside.md', content: 'x', note: 'n' }],
    ['mkdir', { kind: 'mkdir', path: '../outside', note: 'n' }],
    ['rm', { kind: 'rm', path: '/etc/passwd', note: 'n' }],
  ] as [string, Action][])('refuses an escaping %s action', (kind, action) => {
    expect(() => assertContained([action])).toThrow(new RegExp(`\\(${kind}\\)`));
    expect(() => assertContained([action])).toThrow(/outside the project root/);
  });

  it('names the cause, the guarantee and the config fields that set the path', () => {
    // The adopting agent's only guaranteed channel is this line. "Refused" alone
    // reads as a tool bug; the fields are what turn it into an edit.
    const escaping: Action = { kind: 'write', path: '../CLAUDE.md', content: 'x', note: 'n' };

    expect(() => assertContained([escaping])).toThrow(/nothing was written/);
    expect(() => assertContained([escaping])).toThrow(/emit\.handbook/);
    expect(() => assertContained([escaping])).toThrow(/emit\.agents\[\]\.path/);
    expect(() => assertContained([escaping])).toThrow(/\.\.\/CLAUDE\.md/);
  });

  it('refuses the whole list, however deep the escaping action sits', () => {
    // The reason this runs before any effect rather than per action: a refusal
    // reached on the fifth action has already applied four.
    const actions: Action[] = [
      ...contained,
      { kind: 'write', path: '../outside.md', content: 'x', note: 'n' },
    ];

    expect(() => assertContained(actions)).toThrow(/outside the project root/);
  });
});
