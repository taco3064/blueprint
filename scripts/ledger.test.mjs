import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The survivor ledger, guarded as a property rather than as a count.
 *
 * `.claude/docs/mutation-testing.md` keeps the ledger of mutants proven equivalent at
 * the sites themselves — no file to maintain, no line numbers to drift. Until #399
 * converts the corpus it reads in two forms at once, and an entry is either one: the
 * older prose proof, found by `grep -rni undecidable src/ --include='*.ts'`, or the
 * `// Stryker disable next-line <Mutator>: <reason>` directive that replaces it. Both
 * are counted below, because converting a proof does not remove one.
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
 * proof added. A directive cannot fail that way — it is matched only at the head of a
 * comment line, so an identifier can never be one — which makes the code assertion the
 * prose form's guard, kept for as long as a prose entry is left.
 *
 * A property, never the number. A count pinned here would go red the next time somebody
 * writes a legitimate proof — the correct act punished, which is the argument that doc
 * already makes one level up against a mutation-score threshold. The floor is taken
 * over the union of the two forms for the same reason read from the other end: pinned
 * to the older form alone it would go red on #399 converting the corpus, punishing the
 * act the doc asks for.
 *
 * **Outside `src/` because it has to be.** A guard that matches the word contains the
 * word, so in `src/` it would answer its own grep — SIX more hits, none of them a
 * proof, and the two halves fail in opposite ways. THREE are code: the word's two
 * regexes and the `describe` title. The code assertion below catches every one of them,
 * loudly. THREE are prose in this comment, and that same assertion is written to pass
 * over prose — so they would sit in the ledger as three more entries with nothing
 * anywhere saying they are not proofs. **The silent three are why this file cannot
 * live in `src/`.** A loud red is a bug report; a ledger three entries too long is the
 * defect this guard exists to catch. The scope it measures is the scope it cannot live
 * in. The directive half contributes none of those six: its pattern is anchored at the
 * head of a comment line, so neither the pattern itself nor a mention of it in prose is
 * ever an entry — the older form's hazard, stated once more as the reason the newer one
 * replaces it. `field-run.test.mjs` beside it is the standing case for a test that runs
 * in `npm test` while having nothing under `src/` to sit next to.
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

/** The older prose form. */
const WORD = /undecidable/i;

/**
 * The directive that replaces it, anchored at the head of a comment line and requiring
 * the mutator and the reason the convention asks for — a bare `// Stryker disable
 * next-line` suppresses mutants nobody has read and is not a ledger entry.
 */
const DIRECTIVE = /^\s*\/\/\s*Stryker disable next-line\s+\S+\s*:\s*\S/;

const hits = sources(SRC).flatMap((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const prose = proseLines(text);

  return text
    .split('\n')
    .map((line, index) => ({ file, line: index + 1, text: line, prose: prose[index] }))
    .filter((hit) => WORD.test(hit.text) || DIRECTIVE.test(hit.text));
});

// A trailing comment is prose too, and there the word sits after the slashes.
const code = hits.filter((hit) => !hit.prose && !/\/\/.*undecidable/i.test(hit.text));

describe('the survivor ledger of `undecidable` proofs and Stryker directives reads', () => {
  it('has proofs in it at all', () => {
    // Non-vacuous: the prose assertion below passes on an empty list, and an empty list
    // is what a walk that read nothing hands back. The floor is that doc's own figure for
    // a converged sweep — not the current count, which moves and must not be pinned here.
    expect(hits.length).toBeGreaterThanOrEqual(24);
  });

  it('holds nothing but prose — no hit is a symbol name', () => {
    // A proof is a sentence the next sweep meets at the site, so every hit sits in a
    // comment. An identifier carrying the word cannot: it is code, and it multiplies one
    // fact into as many ledger entries as it has references.
    expect(code.map((hit) => `${path.relative(SRC, hit.file)}:${hit.line}`)).toEqual([]);
  });

  it('still carries the no-lift proof the coverage measurement turns on', () => {
    // Criterion 16's mutant, named by its file rather than by a line number — and no
    // longer by its opening words either, because #399 rewrites this entry as a
    // directive and the wording of that is its ticket's to choose. What is asked is what
    // survives the conversion and not the deletion: the site still carries an entry, in
    // whichever of the two forms the ledger holds it.
    expect(hits.some((hit) =>
      hit.file.endsWith(path.join('inspect', 'coverage.ts')))).toBe(true);
  });
});
