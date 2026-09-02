import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { outOfScanReachClause } from '../emit/lint/patterns';
import { outsideScanReach, scan } from './scan';

/**
 * The sentence `outOfScanReachClause` prints states three facts about THIS walk — the root
 * it reads, the directories it refuses, the extensions it reads — from a module that cannot
 * import `scan` and is not allowed to know it. Its own sibling names that as the thing not
 * to do: the facts are `scan`'s, and `emit/lint` "must not grow a second copy of the
 * answer". A copy nothing compares goes on printing after the original moves.
 *
 * Here, and not beside the sentence, because this is the only side that can hold both:
 * `inspect` may read `emit/lint` and the layer order forbids the reverse. Beside `scan.ts`
 * because the walk is what the sentence is wrong ABOUT when it is wrong.
 *
 * One row per clause: the words the sentence spends on it, and the walk behaviour it
 * claims, measured on a real tree and against the reader the `Measured:` half is built
 * from. Nothing here restates `NON_SOURCE_DIRS` or `SOURCE_EXT` — those stay `scan.ts`'s,
 * covered per member beside the walk that owns them, and a third copy written to make this
 * test possible would be the defect it exists to close.
 */

/** The source root every row is measured under — not the default, which hides a hardcode. */
const SOURCE_ROOT = 'app';

/** The one file every row's walk must read, so "read nothing" cannot satisfy a claim. */
const READ = 'app/components/Button.ts';

/** One clause of the sentence, and what the walk has to do for it to be true. */
interface Claim {
  /** The sentence's own words for this clause. */
  clause: string;
  /** A file written beside `READ` that the walk must leave out. */
  unread: string;
  /** A declared glob pointing at that file, and what the reader settles about it. */
  glob: string;
  reason: string;
}

const CLAIMS: Claim[] = [
  {
    clause: 'reads the source root and nothing above it',
    unread: 'scripts/build.ts',
    glob: 'scripts/**',
    reason: 'outside the source root `app`',
  },
  {
    clause: 'never descends into the directories a build writes',
    unread: 'app/dist/bundle.ts',
    glob: 'app/dist/**',
    reason: 'a directory this scan never descends into (`dist`)',
  },
  {
    clause: 'reads only source extensions',
    unread: 'app/components/Button.css',
    glob: 'app/**/*.css',
    reason: 'a file type this scan does not read (`.css`)',
  },
];

/** The clause as a run that measured this glob prints it, cost and all. */
const printed = (claim: Claim) =>
  outOfScanReachClause(
    [{ glob: claim.glob, unreached: outsideScanReach(claim.glob, SOURCE_ROOT) }],
    'the caller supplies what that costs',
  );

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-clause-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (rel: string) => {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'export const x = 1;\n');
};

describe('outOfScanReachClause · the sentence against the walk it describes', () => {
  it.each(CLAIMS)('walks the way it says it $clause', (claim) => {
    write(READ);
    write(claim.unread);

    // The whole list, never an absence: a file the walk starts reading is an extra entry
    // whatever it is called, and a walk that read nothing would satisfy all three clauses
    // at once. `READ` is what says the walk ran.
    expect(scan(root, SOURCE_ROOT).files.map((file) => file.path)).toEqual([READ]);

    // The reader the sentence's `Measured:` half is built from, on a glob pointing at the
    // file the walk just left out.
    expect(outsideScanReach(claim.glob, SOURCE_ROOT)).toBe(claim.reason);

    // And the sentence still spends these words on it, in the same run that measured it.
    expect(printed(claim)).toContain(claim.clause);
  });

  it('names every class it counts, and counts every class it names', () => {
    // The sentence closes on "all three", so the count is part of the claim and not
    // decoration: it is what makes the three clauses exhaustive rather than a sample.
    expect(CLAIMS).toHaveLength(3);
    expect(printed(CLAIMS[0])).toContain('outside all three');

    // Each clause once, in one sentence — the rows are three readings of one text, so a
    // clause dropped from it cannot be alive in another row.
    for (const claim of CLAIMS) {
      expect(printed(CLAIMS[0]).split(claim.clause)).toHaveLength(2);
    }
  });
});
