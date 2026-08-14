import { describe, expect, it } from 'vitest';

import { hasErrors, report } from './report';
import type { Finding } from './types';

const findings: Finding[] = [
  { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', subject: '', message: 'nope' },
  { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', subject: '', message: 'no entry' },
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
    const out = report([{ severity: 'info', rule: 'mystery', path: 'x', subject: '', message: 'm' }]);

    expect(out).not.toContain('Recommended migration steps');
  });

  it('renders the finding without its subject — that field is identity, not prose', () => {
    // The subject is what the baseline keys on. It is deliberately absent from the
    // rendered line: the message already names the specifier in a sentence, and a
    // report that prints both says the same thing twice in two formats.
    const out = report([
      {
        severity: 'error',
        rule: 'deep-import',
        path: 'src/pages/Home/Home.tsx',
        subject: '~app/hooks/useX/impl',
        message: '"~app/hooks/useX/impl" reaches inside a module — import it through its entry.',
      },
    ]);

    expect(out).toContain('[deep-import] src/pages/Home/Home.tsx');
    expect(out).toContain('reaches inside a module');
    expect(out.match(/~app\/hooks\/useX\/impl/g)).toHaveLength(1);
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
      { severity: 'error', rule: 'deep-import', path: 'src/pages/x.ts', subject: '~app/hooks/useX/impl', message: 'm' },
    ]);

    expect(out).toContain('[deep-import]');
    expect(out).toContain('(lint: no-restricted-imports)');
  });

  it('folds the whole structural family into the one rule it really is', () => {
    const out = report([
      { severity: 'error', rule: 'flow-violation', path: 'a', subject: '~app/services/api', message: 'm' },
      { severity: 'error', rule: 'package-ownership', path: 'b', subject: 'axios', message: 'm' },
      { severity: 'error', rule: 'selfonly-reexport', path: 'c', subject: '~app/contexts/Theme', message: 'm' },
      { severity: 'error', rule: 'layer-escape', path: 'd', subject: '../../hooks/useX', message: 'm' },
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
      { severity: 'error', rule: 'cycle', path: 'a', subject: 'a b', message: 'm' },
      { severity: 'info', rule: 'no-entry', path: 'b', subject: '', message: 'm' },
    ]);

    // The other half of the same question: not "where do I find this in the
    // config" but "why is it not there at all".
    expect(out.match(/\(inspect only — never appears in a lint run\)/g)).toHaveLength(2);
  });
});

describe('report · icons and the migration block', () => {
  const all: Finding[] = [
    { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', subject: '', message: 'x' },
    { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', subject: '', message: 'y' },
    { severity: 'info', rule: 'declaratory-self-only', path: 'src/contexts', subject: '', message: 'z' },
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

  it('leaves the migration slot empty when no finding carries a step', () => {
    // `declaratory-self-only` has no migration entry, so the block has nothing to
    // list. Anything in that slot promises steps that were never written — asserted
    // by what directly follows the tally, since the report now legitimately
    // continues into the derivation note.
    const out = report([all[2]]);
    const lines = out.split('\n');
    const counts = lines.findIndex((line) => line.includes('note(s)'));

    expect(out).not.toContain('Recommended migration steps');
    expect(lines[counts + 1]).toBe('');
    expect(lines[counts + 2]).toContain('How this graph was read');
  });
});

describe('report · the module findings are in both tables', () => {
  it('gives undeclared-module a remedy and says lint never carries it', () => {
    const rendered = report([{
      severity: 'error',
      rule: 'undeclared-module',
      path: 'src/Achievements',
      subject: '',
      message: 'ungoverned',
    }]);

    expect(rendered).toContain('[undeclared-module] Declare the folder in `architecture.modules`');
    // `ENFORCED_BY: null` is the point of the finding, not a gap in the table:
    // the globs are built FROM the declared list, so no lint run can ever
    // mention this folder — which is why a green lint proves nothing about it.
    expect(rendered).toContain('(inspect only — never appears in a lint run)');
  });

  it('gives missing-module no migration line, exactly as missing-layer has none', () => {
    // Runway is not a step. A remedy line here would read as a todo, which is
    // the reading field run #13 had to be talked out of one finding over.
    const rendered = report([{
      severity: 'info',
      rule: 'missing-module',
      path: 'src/Session',
      subject: '',
      message: 'runway',
    }]);

    expect(rendered).not.toContain('Recommended migration steps');
  });
});
