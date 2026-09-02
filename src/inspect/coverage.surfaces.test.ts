import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The patterns leaf, not the emit/lint index — the route every inspect-side reader of
// this sentence already takes, for the module cycle the index would close.
import { emptyTestGlobs, unavailableGate } from '../emit/lint/patterns';
import { runDeps } from './deps';
import { runDoctor } from './doctor';
import { runInspect } from './inspect';
import { runRules } from './rules';
import type { Blueprint } from '../config';

/**
 * `architecture.testFiles: []` on one tree, read off every surface its consequence
 * reaches. `unavailableGate` drops `testFilename` out of the optional-gate count for all
 * of them, and only the catalog said why: the other three print the sentence that names
 * dead entries, and an empty net declares none.
 *
 * Driven through the runtimes rather than through the measurement, because what is being
 * asserted is that the cause ARRIVES — a fix landing in `computeCoverage` and not in
 * `deps`, or in three renderers and not in the baseline path, is the shape this is for.
 */

/**
 * The sentence `blueprint rules` prints on its `testFilename` row, pinned literally and
 * once. Every other assertion here reads it from `emptyTestGlobs`, so what they check is
 * that the surfaces AGREE; this is the one that says which wording they agree on, and a
 * silent reword of it reddens here rather than passing four agreeing paraphrases.
 */
const CAUSE = '`architecture.testFiles: []` exempts nothing, so there is no test file for '
  + 'this to name — declare test globs, or drop this gate';

const SOURCE = 'export const a = 1;\n';

const dirs: string[] = [];

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

function repo(testFiles: string[], files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-surfaces-'));

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

afterAll(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('the empty net has one cause, and it is the catalog\'s', () => {
  it('is the same string `blueprint rules` puts on the gate row', () => {
    // The gate verdict and the routed sentence are one function, so a surface cannot
    // hold a second phrasing of what the catalog row already says.
    expect(emptyTestGlobs([])).toBe(CAUSE);

    expect(unavailableGate('testFilename', {
      framework: 'react',
      hasTypescript: true,
      testFiles: [],
    })).toBe(CAUSE);
  });

  it('says nothing about any other shape of the field', () => {
    // Including the shape a dead glob is in: that one is `unreachedTestGlobs`' sentence,
    // and an entry the author declared is not an author who declared none.
    expect(emptyTestGlobs(undefined)).toBeNull();
    expect(emptyTestGlobs(['**/*.test.ts'])).toBeNull();
    expect(emptyTestGlobs(['**/*.test.{ts'])).toBeNull();
    expect(emptyTestGlobs('**/*.test.ts')).toBeNull();
  });
});

/**
 * One source file per layer plus one test file that reaches across them — the tree where
 * every surface's own number moves with the field and nothing else does. The escape is
 * alias-spelled and runs down the layer order, so the run stays clean either way: what
 * separates the two configs is the count, not a finding.
 */
const TREE = {
  'src/pages/a.ts': SOURCE,
  'src/services/b.ts': SOURCE,
  'src/pages/a.test.ts': 'import { b } from \'~app/services/b\';\n\nexport const t = b;\n',
};

interface Surfaces {
  inspect: string;
  doctor: string;
  deps: string;
  rules: string;
  inspectJson: string;
  doctorJson: string;
  depsJson: string;
}

async function surfaces(dir: string): Promise<Surfaces> {
  const take = async (
    run: (sink: (message: string) => void) => Promise<unknown>,
  ): Promise<string> => {
    const lines: string[] = [];

    await run((message) => void lines.push(message));

    return lines.join('\n');
  };

  return {
    inspect: await take((log) => runInspect(dir, { log })),
    doctor: await take((log) => runDoctor(dir, { log })),
    deps: await take((log) => runDeps(dir, { log })),
    rules: await take((log) => runRules(dir, { log })),
    inspectJson: await take((log) => runInspect(dir, { json: true, log })),
    doctorJson: await take((log) => runDoctor(dir, { json: true, log })),
    depsJson: await take((log) => runDeps(dir, { json: true, log })),
  };
}

describe('testFiles: [] · one tree, four surfaces', () => {
  const FOUR = ['inspect', 'doctor', 'deps', 'rules'] as const;

  let empty: Surfaces;
  let healthy: Surfaces;

  beforeAll(async () => {
    empty = await surfaces(repo([], TREE));
    healthy = await surfaces(repo(['**/*.test.ts'], TREE));
  });

  it('moves a number on every one of the four', () => {
    // The premise, asserted before the causes: a surface whose count does not move has
    // nothing to explain, and four assertions about a sentence would still pass on it.
    expect(healthy.inspect).toContain('1/16 optional gates active');
    expect(empty.inspect).toContain('0/15 optional gates active');

    // Doctor's is the same summary, printed under `architecture clean` — it moves there
    // or the check reports a count the sentence beside it does not account for.
    expect(healthy.doctor).toContain('1/16 optional gates active');
    expect(empty.doctor).toContain('0/15 optional gates active');

    // Deps counts no gates; what moves here is the blast radius, because the test file
    // stops being dropped from the graph and its import lands in a fan-in.
    expect(healthy.deps).toContain('0 ← services');
    expect(empty.deps).toContain('1 ← services');

    expect(healthy.rules).toContain('2 of them unavailable here');
    expect(empty.rules).toContain('3 of them unavailable here');
  });

  it.each(FOUR)('%s states the cause, once', (surface) => {
    const output = empty[surface];

    expect(output).toContain(CAUSE);
    // Once, not twice: `toContain` reads the same at one copy and at two, and a routing
    // that fires in a renderer AND in the note list prints the sentence twice with every
    // other assertion here still green.
    expect(output.split(CAUSE).length - 1).toBe(1);
  });

  it.each(FOUR)('%s gains nothing when the net reaches a file', (surface) => {
    // The other direction. Without it the stage passes by printing a cause on every run,
    // which says less about everything rather than more about this.
    expect(healthy[surface]).not.toContain(CAUSE);
    expect(healthy[surface]).not.toContain('architecture.testFiles');
  });

  it('reaches the machine channel of every runtime that has one', () => {
    const coverage = (JSON.parse(empty.inspectJson) as { coverage: object }).coverage;

    expect(coverage).toHaveProperty('testExemption', CAUSE);
    expect(JSON.parse(empty.doctorJson) as { note: string }).toHaveProperty('note');
    expect((JSON.parse(empty.doctorJson) as { note: string }).note).toContain(CAUSE);

    expect((JSON.parse(empty.depsJson) as { testExemption: string }).testExemption)
      .toContain(CAUSE);

    // Absent, not null, and on the healthy side of each: a key always present reads as
    // "measured, nothing wrong" from a channel that cannot see the text output.
    expect((JSON.parse(healthy.inspectJson) as { coverage: object }).coverage)
      .not.toHaveProperty('testExemption');

    expect((JSON.parse(healthy.doctorJson) as { note?: string }).note ?? '')
      .not.toContain(CAUSE);

    expect(JSON.parse(healthy.depsJson) as object).not.toHaveProperty('testExemption');
  });
});

/**
 * The tree the baseline path is measured on: one orphan test file reaching across layers
 * relatively, which is debt exactly when the exemption is gone.
 */
const DEBT = {
  'src/pages/a.ts': SOURCE,
  'src/services/b.test.ts': 'import { a } from \'../pages/a\';\n\nexport const b = a;\n',
};

/** The same tree with debt that survives the exemption — the same-branch control. */
const ALWAYS_DEBT = {
  ...DEBT,
  'src/services/c.ts': 'import { a } from \'../pages/a\';\n\nexport const c = a;\n',
};

/** The document `--update-baseline` records for {@link DEBT} under an empty net. */
const RECORDED = `${JSON.stringify(
  {
    version: 2,
    findings: [
      {
        rule: 'relative-escape',
        path: 'src/services/b.test.ts',
        subject: '../pages/a',
        message: 'Relative import "../pages/a" leaves this layer — use the alias, or '
          + 'extract shared code to a lower layer.',
      },
    ],
  },
  null,
  2,
)}\n`;

describe('inspect --update-baseline states the cause before it writes', () => {
  it('names it ahead of the record, and records the same bytes as before', async () => {
    const dir = repo([], DEBT);
    const lines: string[] = [];

    const { ok } = await runInspect(dir, {
      updateBaseline: true,
      log: (message) => void lines.push(message),
    });

    expect(ok).toBe(true);

    // The worst of the three paths to drop it on: the other two report a finding a
    // reader can still investigate, and this one permanently accepts one that exists
    // only because the exemption is broken. Ahead of the record, not after it.
    expect(lines[0]).toBe(`· ${CAUSE}`);
    expect(lines[1]).toContain('Baseline updated — 1 finding(s) recorded');

    // And the ledger itself did not move: this stage is about what the run says, not
    // about what it accepts. Byte-identical to the document the pre-stage build wrote.
    expect(fs.readFileSync(path.join(dir, '.blueprint-baseline.json'), 'utf-8'))
      .toBe(RECORDED);
  });

  it('adds nothing to a run that records the same debt under a live net', async () => {
    const dir = repo(['**/*.test.ts'], ALWAYS_DEBT);
    const lines: string[] = [];

    await runInspect(dir, { updateBaseline: true, log: (message) => void lines.push(message) });

    // Same branch as the run above — a write, not the retire path — so the difference
    // between them is the sentence and nothing else.
    expect(lines)
      .toEqual(['Baseline updated — 1 finding(s) recorded in .blueprint-baseline.json.']);
  });

  it('carries it onto the retire path too, which reports its own write', async () => {
    // `[]` with nothing to lock. The note belongs to the run, not to the branch: it says
    // why the finding set is the set it is, which is as true of an empty one — and a
    // function speaking on one of its two side-effect branches is the same gap, one
    // level down.
    const dir = repo([], { 'src/pages/a.ts': SOURCE, 'src/services/b.ts': SOURCE });
    const lines: string[] = [];

    await runInspect(dir, { updateBaseline: true, log: (message) => void lines.push(message) });

    expect(lines[0]).toBe(`· ${CAUSE}`);
    expect(lines[1]).toContain('no baseline needed');
    expect(fs.existsSync(path.join(dir, '.blueprint-baseline.json'))).toBe(false);
  });
});
