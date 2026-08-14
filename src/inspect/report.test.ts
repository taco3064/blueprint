import { describe, expect, it } from 'vitest';

import { hasErrors, report } from './report';
import type { Finding } from './types';

const findings: Finding[] = [
  { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', subject: '', message: 'nope' },
  { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', subject: '', message: 'no entry' },
];

/** The rendered header lines — one per finding, in order. */
function headers(rendered: string): string[] {
  return rendered.split('\n').filter((line) => /^ {2}[·⚠✗] \[/.test(line));
}

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

  it('leaves the subject out of a header that identifies its finding already', () => {
    // `rule` + `path` name one finding here, so the header is complete without the
    // third part of the identity, and the message already carries the specifier in a
    // sentence. Pinned as a whole line rather than a substring: a renderer that
    // appended the subject to every finding would satisfy `toContain` unchanged.
    const out = report([
      {
        severity: 'error',
        rule: 'deep-import',
        path: 'src/pages/Home/Home.tsx',
        subject: '~app/hooks/useX/impl',
        message: '"~app/hooks/useX/impl" reaches inside a module — import it through its entry.',
      },
    ]);

    expect(headers(out)).toEqual(['  ✗ [deep-import] src/pages/Home/Home.tsx']);
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

  it('gives undeclared-dependency a remedy, and names the rule that really holds it', () => {
    // Both tables are string lists, one contract per member: an id absent from
    // MIGRATION renders no step, and one absent from ENFORCED_BY sends a reader
    // searching `--print-config` for a name that is not there. The edge is a
    // generated `no-restricted-imports` group, not a rule of its own.
    const rendered = report([{
      severity: 'error',
      rule: 'undeclared-dependency',
      path: 'src/Fighter/hooks/usePilot/index.ts',
      subject: '~app/common',
      message: 'does not declare',
    }]);

    expect(rendered).toContain('[undeclared-dependency] Declare the edge in the importing module\'s `imports`');
    expect(rendered).toContain('no-restricted-imports');
    expect(rendered).not.toContain('inspect only');
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

describe('report · root-import names both rules that hold it', () => {
  it('tells a reader which id carries their spelling', () => {
    // One reach, two mechanisms: the plugin resolves a relative path, and an
    // exact `paths` entry catches the alias form. A reader searching the
    // resolved config for `relative-escape` after an alias violation finds
    // nothing, which is the failure this table exists to prevent.
    const rendered = report([{
      severity: 'error',
      rule: 'root-import',
      path: 'src/GameStage/hooks/useRun/index.ts',
      subject: '~app/GameStage',
      message: 'reaches up',
    }]);

    expect(rendered).toContain('blueprint/relative-escape for a relative path');
    expect(rendered).toContain('no-restricted-imports (paths) for `~app/<Module>`');
    // The third channel, for the spellings a `paths` entry cannot name — a root
    // component's own filename among them.
    expect(rendered).toContain('blueprint/no-module-root-import for every other alias spelling');
  });
});

describe('report · a repeated header carries what tells its findings apart', () => {
  // A finding's identity is three-part — the baseline keys on `rule` + `path` +
  // `subject` — and a header shows the first two. Under `architecture.modules` every
  // layer-level note is addressed at the source root, so four notes printed `src`
  // and which layer each was about lived in the prose underneath.
  const atSourceRoot: Finding[] = [
    { severity: 'info', rule: 'missing-layer', path: 'src', subject: 'hooks', message: 'Declared layer "hooks" holds no code in any module yet.' },
    { severity: 'info', rule: 'missing-layer', path: 'src', subject: 'contexts', message: 'Declared layer "contexts" holds no code in any module yet.' },
    { severity: 'info', rule: 'owns-not-installed', path: 'src', subject: 'rbush', message: 'Layer "hooks" owns "rbush", which is not in package.json.' },
    { severity: 'info', rule: 'declaratory-self-only', path: 'src', subject: 'contexts', message: 'selfOnly on "contexts" (importer(s): hooks) is declaratory.' },
  ];

  it('separates two findings that share a rule and a path', () => {
    expect(headers(report(atSourceRoot)).slice(0, 2)).toEqual([
      '  · [missing-layer] src — hooks',
      '  · [missing-layer] src — contexts',
    ]);
  });

  it('prints no header line twice', () => {
    const lines = headers(report(atSourceRoot));

    expect(lines).toHaveLength(atSourceRoot.length);
    expect(new Set(lines).size).toBe(atSourceRoot.length);
  });

  it('leaves a header bare when its rule already separates it from its neighbours', () => {
    // These two are one each, so their rule ids do the work and the subject they
    // carry stays out of the header — including the `contexts` one note above
    // renders. The header answers repetition, not the presence of a subject.
    expect(headers(report(atSourceRoot)).slice(2)).toEqual([
      '  · [owns-not-installed] src',
      '  · [declaratory-self-only] src',
    ]);
  });

  it('reads the path as part of a header, not the rule alone', () => {
    // One rule at two paths, each carrying a subject: the paths separate them, so
    // neither header needs the specifier. A key that read the rule alone would
    // append one to both.
    const twoFiles: Finding[] = [
      { severity: 'error', rule: 'flow-violation', path: 'src/hooks/useA/index.ts', subject: '~app/hooks/useB', message: 'same-layer import' },
      { severity: 'error', rule: 'flow-violation', path: 'src/hooks/useB/index.ts', subject: '~app/hooks/useA', message: 'same-layer import' },
    ];

    expect(headers(report(twoFiles))).toEqual([
      '  ✗ [flow-violation] src/hooks/useA/index.ts',
      '  ✗ [flow-violation] src/hooks/useB/index.ts',
    ]);
  });

  it('leaves a flat project\'s two absent layers as they were', () => {
    // #244's pinned flat case: the layer has a folder of its own here, so the paths
    // differ and `subject` is `''` for exactly that reason.
    const flat: Finding[] = [
      { severity: 'info', rule: 'missing-layer', path: 'src/hooks', subject: '', message: 'no folder yet' },
      { severity: 'info', rule: 'missing-layer', path: 'src/contexts', subject: '', message: 'no folder yet' },
    ];

    expect(headers(report(flat))).toEqual([
      '  · [missing-layer] src/hooks',
      '  · [missing-layer] src/contexts',
    ]);
  });

  it('separates findings that share a header on a flat project too', () => {
    // `modules` made this frequent rather than possible: `owns-not-installed` loops
    // one layer's `owns` list at one path, and the per-import rules fire once per
    // import ref, so a flat project reaches the same repetition with no `modules` in
    // the config. Both shapes measured through `dist/bin.js`.
    const flat: Finding[] = [
      { severity: 'info', rule: 'owns-not-installed', path: 'src/hooks', subject: 'rbush', message: 'Layer "hooks" owns "rbush".' },
      { severity: 'info', rule: 'owns-not-installed', path: 'src/hooks', subject: 'zustand', message: 'Layer "hooks" owns "zustand".' },
      { severity: 'error', rule: 'deep-import', path: 'src/pages/Home/index.tsx', subject: '~app/hooks/useA/impl', message: 'reaches inside a module' },
      { severity: 'error', rule: 'deep-import', path: 'src/pages/Home/index.tsx', subject: '~app/hooks/useB/impl', message: 'reaches inside a module' },
    ];

    expect(headers(report(flat))).toEqual([
      '  · [owns-not-installed] src/hooks — rbush',
      '  · [owns-not-installed] src/hooks — zustand',
      '  ✗ [deep-import] src/pages/Home/index.tsx — ~app/hooks/useA/impl',
      '  ✗ [deep-import] src/pages/Home/index.tsx — ~app/hooks/useB/impl',
    ]);
  });

  it('appends nothing when findings sharing a header carry no subject', () => {
    // No analysis produces this pair: the four directory findings are one per
    // directory, and they are the ones that leave `subject` empty. Asked of the
    // renderer directly because the alternative it guards is a header ending in a
    // bare separator, which is a rendering fault whatever reached it.
    const twins: Finding[] = [
      { severity: 'warn', rule: 'no-entry', path: 'src/pages/Home', subject: '', message: 'first' },
      { severity: 'warn', rule: 'no-entry', path: 'src/pages/Home', subject: '', message: 'second' },
    ];

    expect(headers(report(twins))).toEqual([
      '  ⚠ [no-entry] src/pages/Home',
      '  ⚠ [no-entry] src/pages/Home',
    ]);
  });
});
