import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The survivor ledger, guarded as a property rather than as a count.
 *
 * `.claude/docs/mutation-testing.md` makes `grep -rni undecidable src/ --include='*.ts'`
 * THE ledger of mutants proven equivalent — no file to maintain, no line numbers to
 * drift.
 *
 * What is guarded here is the half a machine can settle: every hit is PROSE, so the
 * count is a count of sentences somebody wrote at a site. Whether any one of them is a
 * SOUND proof is not checkable here and is not claimed. Neither is that doc's "each
 * opens with the word" a rule to check against — real proofs are routinely
 * subject-first ("The `.sort()` is undecidable: …"), so a shape test would fail the
 * corpus rather than the corpus failing it.
 *
 * A symbol carrying the word is what this does catch, and the whole reason there is a
 * guard: its declaration, its import and each of its call sites land in the same grep,
 * and the ledger then reads as four entries that are one identifier and no proof at
 * all. `undecidableClause` did exactly that, and the count went 28 to 33 with one
 * proof added.
 *
 * A property, never the number. A count pinned here would go red the next time somebody
 * writes a legitimate proof — the correct act punished, which is the argument that doc
 * already makes one level up against a mutation-score threshold.
 *
 * **Outside `src/` because it has to be.** A guard that matches the word contains the
 * word, so in `src/` it would answer its own grep — four more hits, none of them a
 * proof, which is the defect it exists to catch. The scope it measures is the scope it
 * cannot live in. `field-run.test.mjs` beside it is the standing case for a test that
 * runs in `npm test` while having nothing under `src/` to sit next to.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Every `.ts` file under `src/`, tests included — the grep's own reach. */
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return sources(full);
    }

    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Whether each line of a file is prose a reader meets, rather than code that runs.
 *
 * Block state is read off the line's own ends, never off the comment markers appearing
 * somewhere inside it: a layer glob carries both sequences mid-string and this repo is
 * full of them. Every block comment here opens one line and closes one, so anchoring is
 * enough — and a tracker that slipped would report a proof as code, which fails loudly
 * instead of passing quietly.
 */
function proseLines(text) {
  let inBlock = false;

  return text.split('\n').map((line) => {
    const trimmed = line.trim();
    const prose = inBlock || /^(\/\/|\/?\*)/.test(trimmed);

    if (!inBlock && trimmed.startsWith('/*') && !trimmed.endsWith('*/')) {
      inBlock = true;
    } else if (inBlock && trimmed.endsWith('*/')) {
      inBlock = false;
    }

    return prose;
  });
}

const hits = sources(SRC).flatMap((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const prose = proseLines(text);

  return text
    .split('\n')
    .map((line, index) => ({ file, line: index + 1, text: line, prose: prose[index] }))
    .filter((hit) => /undecidable/i.test(hit.text));
});

// A trailing comment is prose too, and there the word sits after the slashes.
const code = hits.filter((hit) => !hit.prose && !/\/\/.*undecidable/i.test(hit.text));

describe('the survivor ledger `grep -rni undecidable src/` reads', () => {
  it('has proofs in it at all', () => {
    // Non-vacuous: both assertions below pass on an empty list, and an empty list is
    // what a walk that read nothing hands back. The floor is that doc's own figure for a
    // converged sweep — not the current count, which moves and must not be pinned here.
    expect(hits.length).toBeGreaterThanOrEqual(24);
  });

  it('holds nothing but prose — no hit is a symbol name', () => {
    // A proof is a sentence the next sweep meets at the site, so every hit sits in a
    // comment. An identifier carrying the word cannot: it is code, and it multiplies one
    // fact into as many ledger entries as it has references.
    expect(code.map((hit) => `${path.relative(SRC, hit.file)}:${hit.line}`)).toEqual([]);
  });

  it('still carries the no-lift proof the coverage measurement turns on', () => {
    // Criterion 16's mutant, named by its file and its opening words rather than by a
    // line number: the entry's own measurement is lifted out before the question is
    // asked, so a match proves the entry matched itself and nothing else.
    expect(hits.some((hit) =>
      hit.file.endsWith(path.join('inspect', 'coverage.ts'))
      && hit.text.includes('Undecidable against the file test'))).toBe(true);
  });
});
