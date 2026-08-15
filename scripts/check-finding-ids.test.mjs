import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PAGES,
  SOURCE,
  compare,
  comparePage,
  constructedIds,
  documentedIds,
} from './check-finding-ids.mjs';

/**
 * The guard that replaced a hand-maintained list with a checked one. Both halves
 * are drivable without the filesystem, and the last case runs the real repo
 * through them — because a parser that reads nothing reports a clean page.
 */

const page = (documented, file = 'p.md') => ({ file, heading: '## H', documented });

describe('constructedIds', () => {
  it('reads the finding() helper', () => {
    const source = `
      findings.push(finding('error', 'module-reexport', file.path, target, 'msg'));
      return finding('warn', 'no-entry', file.path, '', 'msg');
      findings.push(finding('info', 'declaratory-self-only', path, '', 'msg'));
    `;

    expect([...constructedIds(source)].sort())
      .toEqual(['declaratory-self-only', 'module-reexport', 'no-entry']);
  });

  it('reads a bare object literal', () => {
    expect([...constructedIds("findings.push({ severity: 'info', rule: 'missing-layer', path });")])
      .toEqual(['missing-layer']);
  });

  it('reads both arms of the two-name ternary', () => {
    const source = "{ rule: modular ? 'undeclared-module' : 'undeclared-folder', path }";

    expect([...constructedIds(source)].sort()).toEqual(['undeclared-folder', 'undeclared-module']);
  });

  it('ignores an emitted lint rule id, which is not a finding', () => {
    expect([...constructedIds("{ rule: 'blueprint/no-module-reexport', covers: 'x' }")]).toEqual([]);
  });

  it('deduplicates an id built at more than one site', () => {
    const source = `
      finding('error', 'deep-import', a, b, 'unit level');
      finding('error', 'deep-import', a, b, 'module level');
    `;

    expect([...constructedIds(source)]).toEqual(['deep-import']);
  });
});

describe('documentedIds', () => {
  const md = [
    '# Page',
    '',
    '## H',
    '',
    '- **`cycle`** · error — mentions `no-entry` in its prose, which does not count',
    '- **`missing-layer`** · info — text',
    '',
    '## Next section',
    '',
    '- **`maxLines`** → `max-lines`',
  ].join('\n');

  it('reads the ids a section lists, and only from the leading code span', () => {
    expect([...documentedIds(md, '## H')].sort()).toEqual(['cycle', 'missing-layer']);
  });

  it('stops at the next h2, so a later list is not absorbed', () => {
    expect(documentedIds(md, '## H').has('maxLines')).toBe(false);
  });

  it('reads to the end of the file when the section is last', () => {
    expect([...documentedIds('## H\n\n- **`cycle`** · error — text', '## H')]).toEqual(['cycle']);
  });

  it('returns null when the heading was renamed', () => {
    expect(documentedIds(md, '## Gone')).toBeNull();
  });
});

describe('comparePage', () => {
  const constructed = new Set(['cycle', 'no-entry']);

  it('passes when the two sets are equal', () => {
    expect(comparePage(constructed, page(new Set(['cycle', 'no-entry'])))).toEqual([]);
  });

  it('names the ids the page never lists', () => {
    expect(comparePage(constructed, page(new Set(['cycle'])))).toEqual([
      'p.md: 1 id(s) inspect can produce and the page never lists — no-entry',
    ]);
  });

  it('names an id nothing produces, the shape relative-escape had', () => {
    const documented = new Set(['cycle', 'no-entry', 'relative-escape']);

    expect(comparePage(constructed, page(documented))).toEqual([
      'p.md: 1 id(s) listed that no code path produces — relative-escape',
    ]);
  });

  it('reports both directions from one page at once', () => {
    expect(comparePage(constructed, page(new Set(['relative-escape'])))).toHaveLength(2);
  });

  it('fails on a missing heading rather than passing vacuously', () => {
    expect(comparePage(constructed, page(null))).toEqual(['p.md: heading not found — ## H']);
  });
});

describe('compare', () => {
  it('flattens every page, so one locale drifting alone still fails', () => {
    const constructed = new Set(['cycle']);
    const pages = [page(new Set(['cycle']), 'en.md'), page(new Set(), 'zh.md')];

    expect(compare(constructed, pages)).toEqual([
      'zh.md: 1 id(s) inspect can produce and the page never lists — cycle',
    ]);
  });
});

describe('this repo', () => {
  const read = (file) => fs.readFileSync(file, 'utf-8');
  const constructed = constructedIds(read(SOURCE));

  it('constructs a set nothing else in the suite pins, so the parser cannot read zero', () => {
    expect(constructed.size).toBeGreaterThan(15);
    expect(constructed.has('structure-mismatch')).toBe(true);
    expect(constructed.has('relative-escape')).toBe(false);
  });

  it.each(PAGES)('$file lists exactly what inspect can produce', ({ file, heading }) => {
    const documented = documentedIds(read(file), heading);

    expect(comparePage(constructed, { file, heading, documented })).toEqual([]);
  });
});
