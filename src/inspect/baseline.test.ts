import { describe, expect, it } from 'vitest';

import { baselineSummary, parseBaseline, renderBaseline, splitByBaseline } from './baseline';
import type { Finding } from './types';

const finding = (over: Partial<Finding> = {}): Finding => ({
  severity: 'error',
  rule: 'flow-violation',
  path: 'src/components/Btn/Btn.ts',
  subject: '~app/services/api',
  message: 'no',
  ...over,
});

/** A well-formed v2 document body, for the shape check's own fixtures. */
const doc = (findings: string): string => `{"version":3,"findings":${findings}}`;

const entry = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ rule: 'r', path: 'p', subject: 's', message: 'm', ...over });

describe('splitByBaseline', () => {
  it('suppresses recorded findings, surfaces fresh ones, counts stale entries', () => {
    const recorded = finding();
    const fresh = finding({ path: 'src/components/New/New.ts' });
    const gone = finding({ path: 'src/hooks/old/old.ts' });

    const split = splitByBaseline(
      [recorded, fresh],
      JSON.parse(renderBaseline([recorded, gone])).findings,
    );

    expect(split.fresh).toEqual([fresh]);
    expect(split.suppressed).toBe(1);
    expect(split.stale).toBe(1);
  });
});

describe('splitByBaseline · identity survives a reworded message', () => {
  it('keeps suppressing a finding whose message was rewritten', () => {
    // The reason the key moved. This repo rewords findings often — the message is
    // the part that exists to be improved — and while identity included it, every
    // such release retired the baseline entries for that rule: the same old debt
    // came back as `fresh`, the recorded entry counted as `stale`, and a brownfield
    // CI went red on an upgrade that changed no code.
    const before = finding({ message: '"pages" may not import "components".' });

    const after = finding({
      message: '"pages" may not import "components" — move the shared code to a lower layer.',
    });

    const split = splitByBaseline([after], JSON.parse(renderBaseline([before])).findings);

    expect(split.fresh).toEqual([]);
    expect(split.suppressed).toBe(1);
    expect(split.stale).toBe(0);
  });

  it('still surfaces a finding whose subject is new', () => {
    // The other direction, and what stops the fix from being "suppress everything
    // in this file": a second banned import in an already-baselined file is new
    // debt, and only the subject can tell the tool that.
    const recorded = finding({ subject: '~app/services/api' });
    const added = finding({ subject: '~app/services/auth' });

    const recordedOnly = JSON.parse(renderBaseline([recorded])).findings;
    const split = splitByBaseline([recorded, added], recordedOnly);

    expect(split.fresh).toEqual([added]);
    expect(split.suppressed).toBe(1);
  });

  it('keeps two findings of one rule in one file apart', () => {
    // `rule` + `path` alone would collapse these into a single entry, so baselining
    // one deep import would silently suppress every other one in the same file.
    const first = finding({ rule: 'deep-import', subject: '~app/hooks/useA/impl' });
    const second = finding({ rule: 'deep-import', subject: '~app/hooks/useB/impl' });

    expect(JSON.parse(renderBaseline([first, second])).findings).toHaveLength(2);
  });

  it('reads a cycle as one knot however the path was printed', () => {
    // A cycle's subject is its members, sorted — `a → b → a` and `b → a → b` are one
    // knot printed from two starting points, and the printed path is what moves when
    // an unrelated edge changes which node the walk entered from.
    const printedFromA = finding({
      rule: 'cycle',
      path: 'components/A',
      subject: 'components/A components/B',
      message: 'Import cycle between modules: components/A → components/B → components/A.',
    });

    const printedFromB = finding({
      rule: 'cycle',
      path: 'components/A',
      subject: 'components/A components/B',
      message: 'Import cycle between modules: components/B → components/A → components/B.',
    });

    const recorded = JSON.parse(renderBaseline([printedFromA])).findings;
    const split = splitByBaseline([printedFromB], recorded);

    expect(split.suppressed).toBe(1);
    expect(split.stale).toBe(0);
  });
});

describe('renderBaseline / parseBaseline', () => {
  it('round-trips sorted and deduplicated entries', () => {
    const b = finding({ rule: 'a-rule' });
    const a = finding({ rule: 'z-rule' });

    const entries = parseBaseline(renderBaseline([a, b, a]));

    expect(entries).toHaveLength(2);
    expect(entries[0].rule).toBe('a-rule'); // sorted, stable diffs
  });

  it('records the subject and the message, and stamps the version it wrote', () => {
    // The message is written but never read: it is what makes a regenerated
    // baseline's diff legible. The version is what lets the reader refuse a file
    // whose entries predate the key, rather than mismatching every one in silence.
    const document = JSON.parse(renderBaseline([finding()]));

    expect(document.version).toBe(3);

    expect(document.findings[0]).toEqual({
      rule: 'flow-violation',
      path: 'src/components/Btn/Btn.ts',
      subject: '~app/services/api',
      message: 'no',
    });
  });

  it('sorts by key instead of leaving insertion order be', () => {
    // Three entries, already in key order. A comparator that always answers
    // "less than" reverses them — which two entries cannot reveal, because with
    // two the reversal happens to agree with the sorted answer.
    const entries = parseBaseline(renderBaseline([
      finding({ rule: 'a-rule' }),
      finding({ rule: 'm-rule' }),
      finding({ rule: 'z-rule' }),
    ]));

    expect(entries.map((entry) => entry.rule)).toEqual(['a-rule', 'm-rule', 'z-rule']);
  });

  // The baseline file is hand-editable, and every arm of the shape check needs
  // its own malformed document. A check that quietly passes a broken file lets
  // a junk baseline suppress real findings — the failure mode the ratchet
  // exists to prevent.
  it.each([
    ['not JSON at all', '{ nope', /not valid JSON/],
    ['a bare number', '42', /unexpected shape/],
    ['a bare string', '"findings"', /unexpected shape/],
    ['null, which is typeof object', 'null', /unexpected shape/],
    ['an object with no findings key', '{"version":3}', /unexpected shape/],
    ['findings that are not an array', doc('42'), /unexpected shape/],
    ['an entry that is not an object', doc('[42]'), /unexpected shape/],
    ['a null entry', doc('[null]'), /unexpected shape/],
    ['a non-string rule', doc(`[${entry({ rule: 1 })}]`), /unexpected shape/],
    ['a non-string path', doc(`[${entry({ path: 1 })}]`), /unexpected shape/],
    ['a non-string subject', doc(`[${entry({ subject: 1 })}]`), /unexpected shape/],
    ['a non-string message', doc(`[${entry({ message: 1 })}]`), /unexpected shape/],
    // One good entry beside a broken one: "any entry is broken" and "every
    // entry is broken" agree on a uniform list and part company only here.
    ['a broken entry among valid ones', doc(`[${entry()},42]`), /unexpected shape/],
  ])('rejects %s', (_label, text, pattern) => {
    expect(() => parseBaseline(text)).toThrow(pattern);
  });

  it('accepts a minimal well-formed document', () => {
    expect(parseBaseline(doc(`[${entry()}]`)))
      .toEqual([{ rule: 'r', path: 'p', subject: 's', message: 'm' }]);
  });
});

describe('parseBaseline · a baseline from an older blueprint is refused, not reinterpreted', () => {
  // Read under the new key, a v1 file suppresses nothing: every recorded entry
  // mismatches, the whole ledger comes back as fresh, and the adopter meets the wall
  // of red the baseline exists to prevent — with no stated cause. Refusing is the
  // cheaper failure, and the remedy loses nothing: the debt is still in the repo, so
  // re-keying records the same entries.
  it.each([
    ['version 1, as the first release wrote it', '{"version":1,"findings":[]}'],
    // The version this release replaces: its entries are keyed on finding ids
    // that no longer exist, so every one of them would come back as fresh debt.
    ['version 2, keyed on the finding ids #203 split', '{"version":2,"findings":[]}'],
    ['no version at all, hand-written', '{"findings":[]}'],
    ['a version from the future', '{"version":4,"findings":[]}'],
  ])('refuses %s', (_label, text) => {
    expect(() => parseBaseline(text)).toThrow(/regenerate it with --update-baseline/);
  });

  it('says which version it read, what changed, and that re-keying suppresses the same debt', () => {
    // Three things the adopting agent cannot get anywhere else: whether this is
    // corruption or an upgrade, why the old key was wrong, and whether running the
    // fix quietly widens what the gate ignores. Without the last one, the safe
    // reading of "regenerate the ledger" is to audit it by hand first.
    const message = (() => {
      try {
        parseBaseline('{"version":2,"findings":[]}');
      } catch (error) {
        return (error as Error).message;
      }

      return '';
    })();

    expect(message).toContain('version 2');
    expect(message).toContain('version 3');
    expect(message).toContain('--update-baseline');
    expect(message).toContain('relative-escape');
    expect(message).toContain('nothing is suppressed that was not suppressed before');
  });

  // One clause per predecessor: "regenerate it" with no cause reads as
  // corruption, and the safe response to corruption is to audit the file by
  // hand before running anything. Each version this release has ever written
  // needs its own answer, or the reader gets someone else's reason.
  it.each([
    ['1', '{"version":1,"findings":[]}', /message text/],
    ['2', '{"version":2,"findings":[]}', /"relative-escape"/],
    ['one it never wrote', '{"version":9,"findings":[]}', /cannot say what that version recorded/],
  ])('explains what changed for version %s', (_label, text, pattern) => {
    expect(() => parseBaseline(text)).toThrow(pattern);
  });
});

describe('baselineSummary', () => {
  it('always reports suppressed; mentions the ratchet only when stale', () => {
    expect(baselineSummary({ fresh: [], suppressed: 3, stale: 0 })).toBe(
      '3 baselined finding(s) suppressed.',
    );

    expect(baselineSummary({ fresh: [], suppressed: 0, stale: 1 })).toContain(
      '1 baseline entry no longer occur',
    );

    expect(baselineSummary({ fresh: [], suppressed: 0, stale: 2 })).toContain(
      '2 baseline entries no longer occur',
    );
  });
});
