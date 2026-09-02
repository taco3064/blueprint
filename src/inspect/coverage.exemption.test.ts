import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

// Test-only import of the full emit module, the route `doctor.report.test.ts` already
// takes downward: the real-ESLint case needs emitLint's actual entries, not a paraphrase
// of the shape they are believed to have.
import { emitLint } from '../emit/lint';
import { resolveTestFiles, unreachedTestGlobs } from '../emit/lint/patterns';
import { runInspect } from './inspect';
import { runRules } from './rules';
import type { Blueprint } from '../config';

/**
 * The test exemption's reach, driven through both runtimes rather than through
 * `unavailableGate` alone. The verdict line and the optional-gate count come from
 * different callers of that one function, and a fix that moves one and not the other
 * still reads as a healthy gate from whichever output the reader happened to open.
 */

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

const base: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    sourceRoot: 'src',
    layers: [
      { name: 'pages', does: 'screens' },
      { name: 'services', does: 'net' },
    ],
    module: { layout: 'flat', entry: 'index', private: [] },
  },
  rules: { testFilename: 'error' },
};

const SOURCE = 'export const a = 1;\n';
const importsA = (up: string) => `import { a } from '${up}pages/a';\n\nexport const b = a;\n`;

/** One source file and one orphan test file — nothing here violates any rule. */
const ORPHAN = { 'src/pages/a.ts': SOURCE, 'src/pages/orphan.test.ts': SOURCE };

/** The same shape, with the test file reaching out of its module. */
const ESCAPE = { 'src/pages/a.ts': SOURCE, 'src/services/b.test.ts': importsA('../') };

/**
 * Two ways to write a glob that compiles cleanly and reaches nothing. Both are
 * cases, because a fix keyed on how a glob LOOKS passes the first and fails the
 * second: the unmatched `{` is visibly odd, while the one below it is a `{` whose
 * `}` belongs to a later group — legal-looking, and it matches only a path ending
 * `/tsx`.
 */
const UNREACHING = ['**/*.test.{ts', '**/{__tests__/**/*.{ts,tsx}'];

function repo(testFiles: string | string[] | undefined, files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-exempt-'));

  dirs.push(dir);

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { react: '^18' } }),
  );

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);

    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  fs.writeFileSync(
    path.join(dir, 'blueprint.config.mjs'),
    `export default ${JSON.stringify({
      ...base,
      architecture: { ...base.architecture, testFiles },
    })};\n`,
  );

  return dir;
}

/** What the two commands actually print, which is the only thing an adopter sees. */
async function outputs(dir: string): Promise<{ rules: string; inspect: string; ok: boolean }> {
  const catalog: string[] = [];
  const report: string[] = [];

  await runRules(dir, { log: (message) => void catalog.push(message) });

  const { ok } = await runInspect(dir, { log: (message) => void report.push(message) });

  return { rules: catalog.join('\n'), inspect: report.join('\n'), ok };
}

/**
 * How many times the cause for one dead `glob` appears in an output.
 *
 * Built from the same function the surface prints, so what this pins is the property —
 * the cause has ONE home in any given output — rather than a sentence a reword would
 * take out from under the count. The catalog's own line is that home, and a gate row
 * that started carrying it too would print the same ~500-character sentence twice; no
 * substring assertion can see the second copy, because `toContain` reads the same at
 * one copy and at two.
 */
function causeCount(output: string, glob: string): number {
  const cause = unreachedTestGlobs([{ glob, matched: 0 }]);

  return cause === null ? 0 : output.split(cause).length - 1;
}

/**
 * The optional-gate count exactly as an agent reads it — asserted present before it is
 * compared, because two runs that both printed no count compare equal and prove nothing.
 * The count is the half a verdict line cannot carry: it is what `inspect` exits on and
 * what an adopting agent acts on.
 */
function gateCount(output: string): string {
  const found = /\d+\/\d+ optional gates active/.exec(output);

  expect(found).not.toBeNull();

  return (found as RegExpExecArray)[0];
}

describe('a testFiles net whose every entry reaches nothing · both runtimes', () => {
  it.each(UNREACHING)('reports %s as an armed gate, count included', async (glob) => {
    const broken = await outputs(repo([glob], ORPHAN));
    const healthy = await outputs(repo(['**/*.test.ts'], ORPHAN));

    // The control first, or the assertions below prove nothing about this glob: a
    // working one is `✓ error` and counts itself in.
    expect(healthy.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(healthy.inspect)).toBe('1/16 optional gates active');

    // `emitLint` writes `files: [glob]` with the rule here exactly as it does for the
    // control: `testFilenameEntry`'s guard is `!testFilename || !testGlobs.length`, and
    // neither disjunct fires — the tier is `error` and the list is not empty. So the
    // gate is armed in both and the denominator cannot move.
    expect(broken.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(broken.inspect)).toBe(gateCount(healthy.inspect));

    // What the dead entry costs is the exemption, and the catalog still says so: the
    // two are not byte-identical, which is the assertion a no-op cannot pass.
    expect(broken.rules).not.toBe(healthy.rules);

    // The glob has an address, so both outputs name it rather than describing it.
    expect(broken.rules).toContain(glob);
    expect(broken.inspect).toContain(glob);

    // Once, not twice. The gate row carries no cause now, so the catalog's own line is
    // this net's only home for it — let a second surface fire and the same ~500-character
    // sentence prints twice with every assertion above still green.
    expect(causeCount(broken.rules, glob)).toBe(1);
  });

  it('closes the gate on an empty list, the testFiles shape emitLint drops', async () => {
    const empty = await outputs(repo([], ORPHAN));
    const healthy = await outputs(repo(['**/*.test.ts'], ORPHAN));

    // The other direction, and the one a repair that simply armed everything would
    // fail: `files: []` is refused by ESLint, so `emitLint` emits no entry at all and
    // the gate really is unopenable here.
    expect(empty.rules).toMatch(/· declared, unavailable here testFilename →/);
    expect(gateCount(empty.inspect)).toBe('0/15 optional gates active');
    expect(gateCount(empty.inspect)).not.toBe(gateCount(healthy.inspect));
    expect(empty.rules).toContain('`architecture.testFiles: []` exempts nothing');

    // Its own cause, not the dead-net one — `[]` is the author's own stated intent, so
    // "declare test globs" is the right next step here and wrong for someone who did.
    expect(empty.rules).not.toContain('no file here matches');
    expect(empty.inspect).not.toContain('no file here matches');
  });

  it('speaks in the runway state too, rather than telling the two apart', async () => {
    // Declared, reaching nothing, and no test file in the tree either. A typo and a
    // convention whose files have not landed are the same measurement, so this says
    // what is true of both and ends in the owner's call — `missing-layer`'s shape.
    // Nothing here fails: it is an info line beside a report that still exits 0.
    const runway = await outputs(repo(['**/*.test.ts'], { 'src/pages/a.ts': SOURCE }));

    expect(runway.ok).toBe(true);
    expect(runway.inspect).toContain('no file here matches `**/*.test.ts`');
    expect(runway.inspect).toContain('the exemption arms itself when a file matches');

    // And the gate above that sentence is armed, with the bridge between them in the
    // sentence itself: nothing is exempt yet, and the rule is emitted over these globs
    // all the same. Two truths with no bridge read as a contradiction.
    expect(runway.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(runway.inspect)).toBe('1/16 optional gates active');
    expect(runway.inspect).toContain('the `testFilename` entry\'s own `files`');

    // And the exemption does arm itself: the same config over a tree with one test file
    // in it is silent, which is what makes the line above a fact about the tree.
    const armed = await outputs(repo(['**/*.test.ts'], ORPHAN));

    expect(armed.rules).not.toContain('no file here matches');
    expect(armed.inspect).not.toContain('no file here matches');
  });
});

/**
 * The three nets a scan cannot answer for, each measured against the run that leaves the
 * field undeclared. `emitLint` emits the same `testFilename` entry for both sides of
 * every pair, so a count that differs is the tool reporting a gate it ships as armed.
 */
describe('a net the scan cannot speak for reads like the undeclared field', () => {
  /** No test file of any spelling, so the built-in pair reaches nothing here either. */
  const PROD = { 'src/pages/a.ts': SOURCE };

  /** The tree the root-level net is measured in — `scan` never leaves `src`. */
  const ROOTED = { ...PROD, 'tests/a.test.ts': SOURCE };

  const DEFAULTS = ['**/*.test.{js,jsx,ts,tsx,vue}', '**/*.spec.{js,jsx,ts,tsx,vue}'];

  it('writes out exactly what an undeclared field resolves to', () => {
    // The third input is only that input while these two lists are one list: written by
    // hand it has to be byte-for-byte what `resolveTestFiles` hands `emitLint` for an
    // undeclared field, or the pair below differs by more than the declaration.
    expect(DEFAULTS).toEqual(resolveTestFiles(undefined));
  });

  it.each([
    ['an entry beginning with a negation', ['!**/*.gen.ts'], PROD],
    ['a root-level tests/ net the scan never descends to', ['tests/**/*.ts'], ROOTED],
    ['the resolved defaults written out explicitly', DEFAULTS, PROD],
  ])('holds the count and the row steady on %s', async (_case, testFiles, files) => {
    const declared = await outputs(repo(testFiles, files));
    const implicit = await outputs(repo(undefined, files));

    expect(declared.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(implicit.inspect)).toBe('1/16 optional gates active');
    expect(gateCount(declared.inspect)).toBe(gateCount(implicit.inspect));
  });

  it('fires in real ESLint on the net it just reported armed', async () => {
    // The claim the count makes, put through the linter rather than reasoned off the
    // emitted shape. `tests/a.test.ts` is an orphan — no `tests/a.*` source beside it —
    // and it sits outside `sourceRoot`, so blueprint's own scan never reads it.
    const dir = repo(['tests/**/*.ts'], ROOTED);

    const config = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitLint({
        ...base,
        architecture: { ...base.architecture, testFiles: ['tests/**/*.ts'] },
      }),
    ];

    const ids = new Linter({ configType: 'flat', cwd: dir })
      .verify(SOURCE, config, { filename: path.join(dir, 'tests', 'a.test.ts') })
      .map((message) => message.ruleId);

    expect(ids).toContain('blueprint/test-filename-matches-source');

    // The same tree through the runtimes: armed there too, and counted in.
    const armed = await outputs(dir);

    expect(armed.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(armed.inspect)).toBe('1/16 optional gates active');
  });
});

describe('one dead entry inside a net that still reaches files', () => {
  /** A truncated second extension list — the commonest real shape. */
  const NET = ['**/*.test.ts', '**/*.spec.{ts'];
  const SPELLED_RIGHT = ['**/*.test.ts', '**/*.spec.ts'];

  const MIXED = {
    'src/pages/a.ts': SOURCE,
    'src/pages/a.test.ts': SOURCE,
    'src/services/b.spec.ts': importsA('../'),
  };

  it('names the dead entry while leaving the working gate open', async () => {
    const broken = await outputs(repo(NET, MIXED));
    const healthy = await outputs(repo(SPELLED_RIGHT, MIXED));

    // Judged as a union this net is healthy — `a.test.ts` really is exempt — so the
    // gate stays open and both runs agree it is: 16, not 15. Calling it unavailable
    // would be false. The defect is one entry inside the net, and only a per-entry
    // measurement can name which.
    expect(broken.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(broken.inspect)).toBe('1/16 optional gates active');

    // Which is why a union-level verdict is not enough on its own: at c7985d1 the
    // catalog was byte-identical to the same repo with the entry spelled right. (The
    // `inspect` halves differed there too, but only by the finding they could not
    // explain — so the assertions that carry this are the two below.)
    expect(broken.rules).not.toBe(healthy.rules);

    expect(broken.rules).toContain('no file here matches `**/*.spec.{ts`');
    expect(broken.inspect).toContain('no file here matches `**/*.spec.{ts`');
    // Only the dead one: naming the whole net sends the reader to the entry that works.
    expect(broken.rules).not.toContain('`**/*.test.ts`');

    // Once here too, and from the other surface: the gate is open, so the catalog's line
    // is this net's only home for the cause. Same property, stated where the other
    // predicate decides it — the count above says the row does not double the catalog's
    // line, this one says the catalog's line does not double the row.
    expect(causeCount(broken.rules, '**/*.spec.{ts')).toBe(1);

    // And on an info-tier line: `·`, the marker the gate rows already use for a state
    // that is not a failure, never `⚠`. The gate is open and this run exits 0, so a
    // warning marker would contradict the run it prints in. Doctor's side of the same
    // distinction is pinned; this side was asserted nowhere, and every assertion above
    // reads the sentence rather than what stands in front of it.
    const cause = unreachedTestGlobs([{ glob: '**/*.spec.{ts', matched: 0 }]) as string;

    expect(broken.rules).toContain(`\n· ${cause}`);
  });

  it('carries the same cause into --json, or the two channels drift', async () => {
    // The playbook sends a folding agent to `rules --json`; a cause that reaches only
    // the text output comes back as the same doubt from the other channel.
    const lines: string[] = [];

    await runRules(repo(NET, MIXED), { json: true, log: (m) => void lines.push(m) });

    expect((JSON.parse(lines.join('')) as { testExemption?: string }).testExemption)
      .toContain('`**/*.spec.{ts`');

    // Absent, not null: a key always present reads as "measured, nothing wrong" from a
    // channel that cannot see the text output, which is the same wrong green one level
    // down.
    const clean: string[] = [];

    await runRules(repo(SPELLED_RIGHT, MIXED), { json: true, log: (m) => void clean.push(m) });

    expect(JSON.parse(clean.join('')) as object).not.toHaveProperty('testExemption');
  });

  it('is what makes the red against the .spec file attributable', async () => {
    const broken = await outputs(repo(NET, MIXED));

    expect(broken.ok).toBe(false);
    expect(broken.inspect).toContain('✗ [relative-escape] src/services/b.spec.ts');
    expect(broken.inspect).toContain('`**/*.spec.{ts`');
    expect(broken.inspect).toContain('no scanned file is dropped from the analysis');

    // Spelled right, the same tree is green — so the finding above belongs to the
    // glob, not to the code.
    const healthy = await outputs(repo(SPELLED_RIGHT, MIXED));

    expect(healthy.ok).toBe(true);
    expect(healthy.inspect).not.toContain('relative-escape');
  });
});

describe('a __tests__ convention — the reason architecture.testFiles exists', () => {
  // The built-in `*.test.* / *.spec.*` pair matches nothing in either repo below, so
  // any discriminator keyed on that pair goes blind on exactly the shape this field is
  // for. The measurement is per declared entry and reads nothing else.
  const NESTED = { 'src/pages/a.ts': SOURCE, 'src/pages/__tests__/a.ts': SOURCE };

  const NESTED_ESCAPE = {
    'src/pages/a.ts': SOURCE,
    'src/services/__tests__/b.ts': importsA('../../'),
  };

  it('separates the broken glob from the working one', async () => {
    const broken = await outputs(repo(['**/__tests__/**/*.{ts'], NESTED));
    const healthy = await outputs(repo(['**/__tests__/**/*.ts'], NESTED));

    expect(healthy.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(healthy.inspect)).toBe('1/16 optional gates active');

    // Byte-identical catalogs at c7985d1 — two repos whose only difference is one
    // character in a glob, with nothing said about the exemption either lost. The gate
    // itself is armed in both: `emitLint` emits it over whatever the globs name.
    expect(broken.rules).not.toBe(healthy.rules);
    expect(broken.rules).toMatch(/✓ error\s+testFilename →/);
    expect(gateCount(broken.inspect)).toBe(gateCount(healthy.inspect));
    expect(broken.inspect).toContain('`**/__tests__/**/*.{ts`');
  });

  it('makes the red against the nested test file attributable', async () => {
    const broken = await outputs(repo(['**/__tests__/**/*.{ts'], NESTED_ESCAPE));

    expect(broken.ok).toBe(false);
    expect(broken.inspect).toContain('✗ [relative-escape] src/services/__tests__/b.ts');
    expect(broken.inspect).toContain('`**/__tests__/**/*.{ts`');

    const healthy = await outputs(repo(['**/__tests__/**/*.ts'], NESTED_ESCAPE));

    expect(healthy.ok).toBe(true);
    expect(healthy.inspect).not.toContain('relative-escape');
  });
});

describe('a repo whose test exemption is broken can find out why', () => {
  it.each(UNREACHING)('names %s in the run that reports the test file', async (glob) => {
    const broken = await outputs(repo([glob], ESCAPE));

    // Still red, and it should be: the exemption really is gone, so the finding is
    // true. What was missing is the cause, in the same output.
    expect(broken.ok).toBe(false);
    expect(broken.inspect).toContain('✗ [relative-escape] src/services/b.test.ts');
    expect(broken.inspect).toContain(glob);
    expect(broken.inspect).toContain('no scanned file is dropped from the analysis');

    // A working glob on the same tree exempts the file and the red goes away — which
    // is what makes the red above attributable to the glob rather than to the code.
    const healthy = await outputs(repo(['**/*.test.ts'], ESCAPE));

    expect(healthy.ok).toBe(true);
    expect(healthy.inspect).not.toContain('relative-escape');
  });
});
