import { describe, expect, it } from 'vitest';

import { hasErrors, report } from './report';
import type { Finding } from './types';

const findings: Finding[] = [
  { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', message: 'nope' },
  { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', message: 'no entry' },
];

describe('hasErrors', () => {
  it('is true only when an error-level finding exists', () => {
    expect(hasErrors(findings)).toBe(true);
    expect(hasErrors([findings[1]])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });
});

describe('report', () => {
  it('celebrates a clean project', () => {
    expect(report([])).toContain('Architecture Success');
  });

  it('lists findings, a summary line, and migration steps', () => {
    const out = report(findings);

    expect(out).toContain('[undeclared-folder] src/utils');
    expect(out).toContain('[no-entry] src/components/Btn');
    expect(out).toContain('1 error(s), 1 warning(s), 0 note(s)');
    expect(out).toContain('Recommended migration steps:');
    expect(out).toContain('declare them as layers');
  });

  it('omits the migration section when no rule has a step', () => {
    const out = report([{ severity: 'info', rule: 'mystery', path: 'x', message: 'm' }]);

    expect(out).not.toContain('Recommended migration steps');
  });
});

describe('report · findings name where they are enforced (field issue #48)', () => {
  // One violation went by three names: inspect called it [deep-import],
  // impact and lint called it no-restricted-imports, and a resolved config
  // searched for `blueprint/deep-import` had no such rule — because the ban
  // folds into no-restricted-imports rather than standing alone. Verifying a
  // merge, that ABSENT read as a dropped rule.
  it('names the ESLint rule that carries a lint-enforced finding', () => {
    const out = report([
      { severity: 'error', rule: 'deep-import', path: 'src/pages/x.ts', message: 'm' },
    ]);

    expect(out).toContain('[deep-import]');
    expect(out).toContain('(lint: no-restricted-imports)');
  });

  it('folds the whole structural family into the one rule it really is', () => {
    const out = report([
      { severity: 'error', rule: 'flow-violation', path: 'a', message: 'm' },
      { severity: 'error', rule: 'package-ownership', path: 'b', message: 'm' },
      { severity: 'error', rule: 'selfonly-reexport', path: 'c', message: 'm' },
      { severity: 'error', rule: 'relative-escape', path: 'd', message: 'm' },
    ]);

    expect(out).toContain('[flow-violation] Rework imports');
    expect(out).toContain('[package-ownership] Move restricted package usage');
    // Three different findings, one emitted entry — that is the fact that
    // made searching a config by finding name useless.
    expect(out.match(/\(lint: no-restricted-imports\)/g)).toHaveLength(2);
    expect(out).toContain('(lint: no-restricted-syntax)');
    // The one structural ban that IS a standalone rule, because a `../`
    // escape cannot be written as a literal pattern.
    expect(out).toContain('(lint: blueprint/relative-escape)');
  });

  it('marks the findings a lint run will never show', () => {
    const out = report([
      { severity: 'error', rule: 'cycle', path: 'a', message: 'm' },
      { severity: 'info', rule: 'no-entry', path: 'b', message: 'm' },
    ]);

    // The other half of the same question: not "where do I find this in the
    // config" but "why is it not there at all".
    expect(out.match(/\(inspect only — never appears in a lint run\)/g)).toHaveLength(2);
  });
});

describe('report · icons and the migration block', () => {
  const all: Finding[] = [
    { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', message: 'x' },
    { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', message: 'y' },
    { severity: 'info', rule: 'declaratory-self-only', path: 'src/contexts', message: 'z' },
  ];

  it('marks each severity with its own icon', () => {
    const out = report(all);

    // The icon is how a reader scans severity down the left edge. An undefined
    // one reads as a rendering fault, and all three collapsing to one mark loses
    // the distinction the report exists to draw.
    expect(out).toContain('✗');
    expect(out).toContain('⚠');
    expect(out).toContain('·');
    expect(out).not.toContain('undefined');
  });

  it('closes on the counts when no finding carries a migration step', () => {
    // `declaratory-self-only` has no migration entry, so the block has nothing to
    // list and the report ends at the tally. Anything in that slot promises steps
    // that were never written.
    const out = report([all[2]]);

    expect(out).not.toContain('Recommended migration steps');
    expect(out.endsWith('0 error(s), 0 warning(s), 1 note(s)')).toBe(true);
  });
});
