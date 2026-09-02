import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

/**
 * Criterion 18's own aspect: WHICH class a dead declared glob is put in, whether the
 * sentence states it or hands it back, and whether both fields answer alike. Its own file
 * rather than a fourth block in `doctor.report.test.ts`, which is at the repo's
 * `maxLines` — the split is by aspect and stays beside `doctor.ts`.
 *
 * Every case runs a REAL runtime and declares one glob on BOTH fields — `testFiles`
 * reaches `outsideScanReach` only through `computeCoverage` → `testFileReach`, so a case
 * that hand-injects the verdict, or that reads the sibling field alone, leaves that
 * plumbing free to hardcode `'src'`, which type-checks at every call site and was green
 * across 570 tests.
 *
 * A NON-DEFAULT `sourceRoot` is what closes that hardcode, and it moves exactly one
 * thing: what `outsideScanReach` answers. So it rides on the four limbs that answer
 * decides, and the two declined limbs run AT the default deliberately — a decline turns
 * on the leading `!`, the reach never gets to speak there, and a root that changed no
 * answer would prove nothing while looking like it proved something.
 */

/** One class, the tree it is measured in, and what both fields must do with it. */
interface Limb {
  limb: string;
  sourceRoot: string;
  glob: string;
  /** The three shapes are mutually exclusive; a case asserts the other two are absent. */
  shape: 'states' | 'hands back' | 'declines';
  /** The reason both fields must give. Only a `states` limb has one. */
  reason?: string;
  files: Record<string, string>;
}

const VUE = '<template><div /></template>';

const LIMBS: Limb[] = [
  {
    limb: 'a path outside the source root',
    sourceRoot: 'app',
    glob: 'scripts/**',
    shape: 'states',
    reason: 'outside the source root `app`',
    files: { 'app/components/Button.vue': VUE, 'scripts/build.js': 'console.log(1);' },
  },
  {
    limb: 'a file type the walk does not read',
    sourceRoot: 'app',
    glob: 'app/**/*.css',
    shape: 'states',
    reason: 'a file type this scan does not read (`.css`)',
    files: { 'app/components/Button.vue': VUE },
  },
  {
    limb: 'a directory the walk never descends into',
    sourceRoot: '.',
    glob: 'dist/**',
    shape: 'states',
    reason: 'a directory this scan never descends into (`dist`)',
    files: { 'components/Button.vue': VUE, 'dist/out.js': 'module.exports = 1;' },
  },
  {
    limb: 'a glob the walk could have reached',
    sourceRoot: 'app',
    glob: 'app/**/*.gen.ts',
    shape: 'hands back',
    files: { 'app/components/Button.vue': VUE },
  },
  {
    // The entry blueprint cannot speak for at all. `globToRegExp` has no `!` branch, so
    // this scan reads a leading `!` as an ordinary path character while ESLint reads it
    // in a config glob as a negation — one string, two entries. Classifying it asserts
    // what the adopter's linter does with an entry this side never saw; handing it back
    // asserts a typo or unlanded files, which is the class this stage exists to stop
    // asserting. Both are wrong, so the note declines and says why.
    limb: 'an entry beginning with a negation',
    sourceRoot: 'src',
    glob: '!src/**/*.css',
    shape: 'declines',
    files: { 'src/components/Button.vue': VUE },
  },
  {
    // The same decline with nothing under it. `!src/**/*.css` reads as a directory
    // literally named `!src`, which the scan settles as outside the root — so the
    // hand-back clause drops it on the reach and never reaches its own negation guard,
    // and that guard decides nothing on any fixture carrying a reason. Here the leading
    // `!` sits on a wildcard, the reach settles nothing, and the decline has to outrank a
    // hand-back rather than arrive after one.
    limb: 'a negation the scan settles nothing about',
    sourceRoot: 'src',
    glob: '!**/*.gen.ts',
    shape: 'declines',
    files: { 'src/components/Button.vue': VUE },
  },
];

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (rel: string, content = '') => {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

/** A finished adoption, plus the tree this limb is measured against. */
function adopted(files: Record<string, string>): void {
  write('blueprint.config.mjs', '// user config');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');

  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
  );

  for (const [rel, content] of Object.entries(files)) {
    write(rel, content);
  }
}

/** The preset at this root with ONE glob declared on both fields — the only axis moved. */
const configFor = (limb: Limb) => async (): Promise<Blueprint> => ({
  ...vuePreset(),
  architecture: {
    ...vuePreset().architecture,
    sourceRoot: limb.sourceRoot,
    layerFilesIgnore: [limb.glob],
    testFiles: [limb.glob],
  },
});

/** The note line for a field, or '' — asserted on, so a missing line fails loudly. */
const noteFor = (output: string, field: string) =>
  output.split('\n').find((line) => line.includes(`\`architecture.${field}\``)) ?? '';

/**
 * Where each class's shared text opens in a note, and where the field's own words resume.
 *
 * One window per shape, opening at text neither other shape can produce. What being dead
 * COSTS is each field's own — an ignore entry excludes and a test glob exempts — and so is
 * the noun a handed-back entry arms, so those two windows close before them. A declined
 * entry carries neither, so its window runs to the end of the note: past the full stop
 * only the field printing a line of its own carries, which is the one character trimmed.
 */
const CLASS_WINDOWS: { shape: Limb['shape']; opens: string; closes?: string }[] = [
  { shape: 'states', opens: 'Measured:', closes: 'This scan reads' },
  { shape: 'hands back', opens: 'whose files have not landed', closes: '— fix the glob' },
  { shape: 'declines', opens: 'An entry beginning' },
];

/**
 * The verdict a field gives on WHICH class this glob is in, in the words BOTH fields have
 * to give it — null only when the note names no class at all, which no limb allows.
 *
 * All three shapes, not the stated one alone. A reader that sees only `Measured:` answers
 * null on the two shapes that state nothing, and an agreement between two nulls is an
 * agreement about nothing — on the two limbs least able to afford one, since a field
 * disagreeing there disagrees in text neither field can be caught on alone.
 *
 * Classification is the thing that must not have two positions; the cost each field prints
 * beside it is one per field, and is asserted per field below.
 */
const verdict = (line: string): string | null => {
  const found = CLASS_WINDOWS
    .map((window) => ({ window, at: line.indexOf(window.opens) }))
    .find(({ at }) => at !== -1);

  if (!found) {
    return null;
  }

  const { window, at } = found;

  return window.closes === undefined
    ? line.slice(at).trim().replace(/\.$/, '')
    : line.slice(at, line.indexOf(window.closes, at)).trim();
};

/**
 * One note against the shape its limb demands — and against the shapes it must NOT have.
 * The absences are the load-bearing half on every arm: each shape asserts something the
 * other two would assert wrongly, so a fix that prints the wrong one still names the glob.
 */
function expectShape(note: string, limb: Limb): void {
  expect(note).toContain(`\`${limb.glob}\``);

  if (limb.shape === 'states') {
    expect(note).toContain(`Measured: \`${limb.glob}\` — ${limb.reason}.`);
    expect(note).not.toContain('look identical from here');
    expect(note).not.toContain('fix the glob');
  } else if (limb.shape === 'hands back') {
    // The half that stops the fix becoming a guess: a typo and a convention whose files
    // have not landed are the same measurement, so the call goes back with both.
    expect(note).toContain('fix the glob, or leave it');
    expect(note).toContain('owner\'s call');
    expect(note).not.toContain('Measured:');
  } else {
    // Neither other shape, and the ABSENCE of both is the assertion — passing by printing
    // one of them is the failure this case exists to catch.
    expect(note).toContain('not read the same way on both sides');
    expect(note).toContain('neither classifies it nor hands it back');
    expect(note).not.toContain('Measured:');
    expect(note).not.toContain('look identical from here');
    expect(note).not.toContain('fix the glob');
  }
}

describe('runDoctor · which class a dead declared glob is put in', () => {
  it.each(LIMBS)('answers $limb on both fields, at sourceRoot $sourceRoot', async (limb) => {
    // Each root-sensitive limb sits in a tree whose root is NOT the default, so a
    // hardcoded root anywhere between the config and `outsideScanReach` turns this red
    // instead of passing on the default. Both fields, because `testFiles` only reaches
    // that helper through `computeCoverage` → `testFileReach`.
    adopted(limb.files);

    let output = '';

    await runDoctor(root, { loadConfig: configFor(limb), log: (m) => (output = m) });

    expectShape(noteFor(output, 'layerFilesIgnore'), limb);
    expectShape(noteFor(output, 'testFiles'), limb);
  });

  it.each(LIMBS)('gives $limb one verdict, not two, in one run', async (limb) => {
    // The two-positions state the sibling's own doc comment forbids — "a second phrasing
    // there would be two positions on one question". One tree, one glob, both fields: the
    // same verdict text, not two individually sensible ones.
    adopted(limb.files);

    let output = '';

    await runDoctor(root, { loadConfig: configFor(limb), log: (m) => (output = m) });

    const ignore = noteFor(output, 'layerFilesIgnore');
    const tests = noteFor(output, 'testFiles');

    // A window on every limb, or the comparison below compares nothing: the two shapes
    // that state no reason are the two a null reader cannot see a disagreement in.
    expect(verdict(ignore)).not.toBeNull();

    if (limb.shape === 'states') {
      expect(verdict(ignore)).toBe(`Measured: \`${limb.glob}\` — ${limb.reason}.`);
    }

    expect(verdict(tests)).toBe(verdict(ignore));
  });
});

/**
 * The half `verdict` above deliberately stops before: not which class the entry is in,
 * but how far this run is entitled to speak for it, and what being dead costs. The
 * first question is one question, so it is one wording; the cost is one per field.
 */
describe('runDoctor · how far a dead entry reaches, and what it costs', () => {
  // The qualification `layerFilesIgnore` has carried since stage 5, and the sibling now
  // takes rather than rephrases. Load-bearing on the first limb, whose `scripts/**` has
  // a real file sitting at it that this walk never went near.
  const QUALIFIED = ['nothing this run read is', 'no scanned file is dropped from the'];

  it.each(LIMBS)('bounds both fields to what this run read, on $limb', async (limb) => {
    adopted(limb.files);

    let output = '';

    await runDoctor(root, { loadConfig: configFor(limb), log: (m) => (output = m) });

    for (const phrase of QUALIFIED) {
      expect(noteFor(output, 'layerFilesIgnore')).toContain(phrase);
      expect(noteFor(output, 'testFiles')).toContain(phrase);
    }
  });

  it.each(LIMBS.filter((limb) => limb.shape === 'states'))(
    'leaves the consequence with the field that prints it, on $limb',
    async (limb) => {
      // `emit/lint` writes `layerFilesIgnore` into an `ignores` with no `files` beside
      // it — repo-wide there, so unreached HERE really is unreached only here. Every
      // `ignores` the test globs ride sits beside a `files`, so the same tail on that
      // field would promise a reach the emitted config does not give it either.
      adopted(limb.files);

      let output = '';

      await runDoctor(root, { loadConfig: configFor(limb), log: (m) => (output = m) });

      const ignore = noteFor(output, 'layerFilesIgnore');
      const tests = noteFor(output, 'testFiles');

      expect(ignore).toContain('it is unreached only here, and the config `emit/lint` '
        + 'emits still applies it wherever it does match');

      expect(tests).not.toContain('still applies it wherever it does match');
      expect(tests).toContain('scoped rather than repo-wide');

      // And the clause they share is still one text, up to the colon the cost hangs off.
      for (const note of [ignore, tests]) {
        expect(note).toContain('could not have matched here however the tree grew:');
      }
    },
  );
});
