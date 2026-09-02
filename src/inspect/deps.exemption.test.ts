import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { unreachedTestGlobs } from '../emit/lint/patterns';
import { runDeps } from './deps';
import type { Blueprint } from '../config';

/**
 * What `deps` says when a declared `architecture.testFiles` entry reaches no file.
 *
 * Driven through `runDeps` rather than through the note builder, and on both channels
 * and both renderings, because the blast radius is a number an agent acts on: a cause
 * that reaches only the leaderboard is invisible to the run that asked about one module,
 * and one that reaches only the text is invisible to every agent piping `--json`.
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
      { name: 'components', does: 'ui' },
      { name: 'services', does: 'net' },
    ],
    module: { layout: 'flat', entry: 'index', private: [] },
  },
};

const SOURCE = 'export const Card = 1;\n';
const importsCard = (up: string) => `import { Card } from '${up}components/Card';\n`;

/** Production only — the shape every case below adds one test file to. */
const PROD = { 'src/components/Card.ts': SOURCE, 'src/services/api.ts': SOURCE };

/** One co-located test file reaching across modules — the only edge in the graph. */
const ESCAPE = { ...PROD, 'src/services/api.test.ts': importsCard('../') };

/** The same edge from a `__tests__` convention, which the built-in pair never matches. */
const NESTED = { ...PROD, 'src/services/__tests__/api.ts': importsCard('../../') };

/**
 * Each dead glob beside the spelling it was meant to have, and the tree it is declared
 * over. Three rows, because a fix keyed on how a glob LOOKS passes the first and fails
 * the second — there the `}` belongs to a later group and nothing reads as odd — and one
 * keyed on the built-in `*.test.* / *.spec.*` pair passes the first and fails both of the
 * others, which is the shape `architecture.testFiles` exists for.
 */
const PAIRS: [dead: string, healthy: string, files: Record<string, string>][] = [
  ['**/*.test.{ts', '**/*.test.ts', ESCAPE],
  ['**/{__tests__/**/*.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', NESTED],
  ['**/__tests__/**/*.{ts', '**/__tests__/**/*.ts', NESTED],
];

function repo(testFiles: string | string[] | undefined, files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-exempt-'));

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

interface Run {
  /** The leaderboard, text. */
  board: string;
  /** The leaderboard, `--json`, parsed. */
  boardJson: Record<string, unknown>;
  /** One module's own report, text. */
  module: string;
  /** The same report, `--json`, parsed. */
  moduleJson: Record<string, unknown>;
  /** `components`' fan-in — the number criterion 11 is about. */
  fanIn: number;
}

/** All four renderings of one repo, since the cause has to reach every one of them. */
async function run(dir: string): Promise<Run> {
  const out: string[] = [];
  const log = (message: string) => void out.push(message);

  const { modules } = await runDeps(dir, { log });

  await runDeps(dir, { json: true, log });
  await runDeps(dir, { target: 'components', log });
  await runDeps(dir, { target: 'components', json: true, log });

  return {
    board: out[0],
    boardJson: JSON.parse(out[1]) as Record<string, unknown>,
    module: out[2],
    moduleJson: JSON.parse(out[3]) as Record<string, unknown>,
    fanIn: modules.find((entry) => entry.module === 'components')?.importedBy.length ?? -1,
  };
}

/**
 * How many times the cause for one dead `glob` appears in an output.
 *
 * Built from the function `inspect` prints, so what this pins is that `deps` prints that
 * sentence and not a paraphrase of it, and that it has ONE home in any given rendering —
 * a property no `toContain` can see, because it reads the same at one copy and at two.
 */
function causeCount(output: string, glob: string): number {
  const cause = unreachedTestGlobs([{ glob, matched: 0 }]);

  return cause === null ? 0 : output.split(cause).length - 1;
}

describe('deps · a declared testFiles entry that reaches no file', () => {
  it.each(PAIRS)('names %s on every rendering', async (dead, healthy, files) => {
    const broken = await run(repo([dead], files));
    const control = await run(repo([healthy], files));

    // The control first, or nothing below is about this glob: spelled right, the same
    // tree exempts the test file and the only edge in the graph disappears.
    expect(control.fanIn).toBe(0);
    expect(control.board).not.toContain('no file here matches');
    expect(control.boardJson).not.toHaveProperty('testExemption');

    // The whole leaderboard, not a substring: before this change the two repos printed
    // byte-identical output, so inequality is an assertion a no-op cannot pass.
    expect(broken.board).not.toBe(control.board);

    // The note and the count come out of one run, so the sentence cannot describe a
    // blast radius the run did not produce.
    expect(broken.fanIn).toBe(1);
    expect(broken.board).toContain(`no file here matches \`${dead}\``);
    expect(broken.board).toContain('counted under the net as written');
    expect(causeCount(broken.board, dead)).toBe(1);
  });

  it.each(PAIRS)('carries %s into --json, the channel an agent reads', async (dead, _ok, files) => {
    const broken = await run(repo([dead], files));

    // Same string as the text, not a second phrasing of it — two channels describing
    // one run in two wordings is the drift this project already paid for once.
    expect(broken.boardJson.testExemption).toBe(broken.board.split('\n  · ')[1].split('\n')[0]);
    expect(broken.boardJson.testExemption).toContain(dead);
  });

  it.each(PAIRS)('reaches the one-module report too (%s)', async (dead, ok, files) => {
    const broken = await run(repo([dead], files));
    const control = await run(repo([ok], files));

    // `deps components` is the reading an agent takes a decision from, and it renders
    // through a different function than the leaderboard.
    expect(broken.module).toContain('imported by (1):');
    expect(broken.module).toContain(`no file here matches \`${dead}\``);
    expect(causeCount(broken.module, dead)).toBe(1);
    expect(broken.moduleJson.testExemption).toContain(dead);

    expect(control.module).toContain('imported by (0):');
    expect(control.module).not.toContain('no file here matches');
    expect(control.moduleJson).not.toHaveProperty('testExemption');
  });
});

describe('deps · the states that must stay silent', () => {
  it('says nothing for an undeclared field, which reaches the built-in pair', async () => {
    const quiet = await run(repo(undefined, ESCAPE));

    expect(quiet.fanIn).toBe(0);
    expect(quiet.board).not.toContain('no file here matches');
    expect(quiet.boardJson).not.toHaveProperty('testExemption');
  });

  it('says nothing for testFiles: [], which is the author\'s own stated intent', async () => {
    const empty = await run(repo([], ESCAPE));

    // The test file is counted here, and correctly: `[]` exempts nothing on purpose.
    // "No file here matches" would be advice for someone who declared globs.
    expect(empty.fanIn).toBe(1);
    expect(empty.board).not.toContain('no file here matches');
    expect(empty.boardJson).not.toHaveProperty('testExemption');
  });

  it('says nothing once every declared entry reaches a file', async () => {
    const armed = await run(repo(['**/*.test.ts', '**/*.spec.ts'], {
      ...ESCAPE,
      'src/components/Card.spec.ts': SOURCE,
    }));

    expect(armed.board).not.toContain('no file here matches');
    expect(armed.boardJson).not.toHaveProperty('testExemption');
  });
});

describe('deps · the two states one dead entry can be in', () => {
  it('speaks in the runway state, where no count moved at all', async () => {
    // Declared, reaching nothing, and no test file in the tree either. A typo and a
    // convention whose files have not landed are the same measurement, so this says
    // what is true of both — including that the number in front of the reader is fine.
    const runway = await run(repo(['**/*.test.ts'], PROD));

    expect(runway.fanIn).toBe(0);
    expect(runway.board).toContain('no file here matches `**/*.test.ts`');
    expect(runway.board).toContain('the exemption arms itself when a file matches');
  });

  it('names only the dead entry inside a net that still reaches files', async () => {
    // The commonest real shape: a truncated second extension list. Judged as a union
    // this net is healthy, so naming the whole thing sends the reader to the entry
    // that works.
    const mixed = {
      ...PROD,
      'src/components/Card.test.ts': SOURCE,
      'src/services/api.spec.ts': importsCard('../'),
    };

    const broken = await run(repo(['**/*.test.ts', '**/*.spec.{ts'], mixed));
    const control = await run(repo(['**/*.test.ts', '**/*.spec.ts'], mixed));

    expect(control.fanIn).toBe(0);
    expect(broken.fanIn).toBe(1);
    expect(broken.board).toContain('no file here matches `**/*.spec.{ts`');
    expect(broken.board).not.toContain('`**/*.test.ts`');
    expect(broken.boardJson.testExemption).toContain('`**/*.spec.{ts`');
  });
});

describe('deps · the states with no count for a cause to be about', () => {
  /** Nothing under a declared layer, so the graph is empty and `legacy/` is skipped. */
  const NO_LAYERS = { 'src/legacy/old.ts': SOURCE };

  /**
   * Both renderings of one run, without the target pair: with no module in the graph a
   * target is always unknown, and that message is not JSON.
   */
  async function board(dir: string): Promise<{ text: string; json: Record<string, unknown> }> {
    const out: string[] = [];
    const log = (message: string) => void out.push(message);

    await runDeps(dir, { log });
    await runDeps(dir, { json: true, log });

    return { text: out[0], json: JSON.parse(out[1]) as Record<string, unknown> };
  }

  // Both rows, because the reachable population is not "someone mistyped a brace": a
  // correctly spelled convention whose files have not landed measures the same, and
  // that is the ordinary mid-adoption state — before any code moves into a layer, which
  // is exactly when the graph is empty.
  const EMPTY_GRAPH = [['**/*.test.{ts'], ['**/*.test.ts']];

  it.each(EMPTY_GRAPH)('stays silent on both channels for %s', async (glob) => {
    const empty = await board(repo([glob], NO_LAYERS));

    expect(empty.json.modules).toEqual([]);
    expect(empty.text).toBe('No modules found under the declared layers.');
    expect(empty.json).not.toHaveProperty('testExemption');
  });

  it('classifies the dead entry against the DECLARED root, not the default one', async () => {
    // `runDeps` is the second of three runtimes that carry `sourceRoot` into
    // `testFileReach`, and arity is not provenance: all three type-check with a
    // hardcoded `'src'`. Read at `src` this glob leaves the root; read at the root the
    // config declares, it is inside it and the extension is what disqualifies it. The
    // two sentences differ, so a hardcoded root turns this red.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-root-'));

    dirs.push(dir);

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', dependencies: { react: '^18' } }),
    );

    for (const [rel, content] of Object.entries({
      'app/components/Card.ts': SOURCE,
      'app/services/api.ts': importsCard('../'),
    })) {
      const full = path.join(dir, rel);

      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }

    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      `export default ${JSON.stringify({
        ...base,
        architecture: { ...base.architecture, sourceRoot: 'app', testFiles: ['app/**/*.css'] },
      })};\n`,
    );

    const out: string[] = [];

    await runDeps(dir, { log: (message) => void out.push(message) });

    expect(out[0]).toContain('Measured: `app/**/*.css` — a file type this scan does not read');
    expect(out[0]).not.toContain('outside the source root');
  });

  it('stays silent on both channels for an unknown target', async () => {
    const dir = repo(['**/*.test.{ts'], ESCAPE);
    const out: string[] = [];
    const log = (message: string) => void out.push(message);

    // The cause explains a count, and there is none in front of this reader either —
    // the module they asked about is not in the graph. The JSON channel prints this
    // same line rather than a payload, so neither can carry the key.
    const { ok } = await runDeps(dir, { target: 'ghost', log });

    await runDeps(dir, { target: 'ghost', json: true, log });

    expect(ok).toBe(false);
    expect(out[0]).toContain('Unknown module "ghost"');
    expect(out.join('\n')).not.toContain('no file here matches');
    expect(out.join('\n')).not.toContain('testExemption');
  });
});

describe('deps · an entry the scan could never have reached', () => {
  it('promises no counted import for files this graph never read', async () => {
    // Every `PAIRS` row above is a malformed brace INSIDE the tree, so the files the
    // entry was meant to cover are scanned and their imports really are in the count.
    // `scripts/**` is the other half: it points outside `sourceRoot`, the walk never
    // read those files, and their imports count nowhere. The tail said one thing for
    // both — and this line has ALREADY said the entry is outside the scan, so the two
    // truths sat side by side with nothing bridging them.
    const { board } = await run(repo(['scripts/**'], { ...PROD, 'scripts/build.ts': SOURCE }));

    expect(board).toContain('outside the source root `src`');
    expect(board).toContain('counted under the net as written');
    expect(board).toContain('nothing in it was exempted through them');
    expect(board).not.toContain('meant to exempt counts in it');
  });
});
