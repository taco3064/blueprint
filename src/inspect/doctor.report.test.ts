import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The conformance module is test support, not a scenario list: `flattenProse` is
// already imported this way from `bootstrap` and `impact`. What lands in
// `src/conformance/` is the fossil record of FIELD findings, and this case is not one.
import { wiredEslintConfig } from '../conformance';
import type { Blueprint } from '../config';
import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

const load = async () => vuePreset();

/** The same preset with one `layerFilesIgnore` entry — the only axis under test. */
const withIgnore = (layerFilesIgnore: string[]): Blueprint => ({
  ...vuePreset(),
  architecture: { ...vuePreset().architecture, layerFilesIgnore },
});

// One character apart, and the difference is measured against the tree rather than
// read off the spelling: `{` with no `}` compiles to a literal brace, so this net
// matches a file named `Widget.{gen` and nothing else.
const deadBlueprint = withIgnore(['**/*.{gen']);
const healthyBlueprint = withIgnore(['**/*.{gen,generated}.ts']);

// The blueprint itself, not just a loader, because the wired fixture below has to hand
// the SAME object to `wiredEslintConfig` — a config resolved from a different blueprint
// than the one doctor read would compare two unrelated things.
const loads = (blueprint: Blueprint) => async () => blueprint;

const dead = loads(deadBlueprint);
const healthy = loads(healthyBlueprint);

/**
 * The wired comparison's blueprint — hand-written, NOT the preset. `wiredEslintConfig`
 * inlines a stub plugin carrying `relative-escape` alone, so a preset's plugin gates
 * (`deepWatch` emits `blueprint/no-deep-watch`) leave the config unresolvable, and the
 * survival check skips on a missing rule instead of running — the one thing this
 * comparison cannot afford.
 */
const wiredBlueprint = (layerFilesIgnore: string[]): Blueprint => ({
  name: 'fixture',
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'data access' },
    ],
    module: { layout: 'flat', entry: 'index', private: [] },
    layerFilesIgnore,
  },
  emit: { agents: [] },
  rules: { unusedVars: 'error' },
});

/** Fixture roots the wired comparison owns, torn down beside `root`. */
const wiredRoots: string[] = [];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });

  while (wiredRoots.length) {
    fs.rmSync(wiredRoots.pop() as string, { recursive: true, force: true });
  }
});

const write = (rel: string, content = '') => {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

/** A finished adoption: config, wired eslint config + alias, no reference files. */
function adopted(): void {
  write('blueprint.config.mjs', '// user config');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');

  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
  );
}

describe('runDoctor · what the run reports', () => {
  it('emits machine-readable JSON with --json', async () => {
    adopted();
    let output = '';

    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (output = m) });

    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it('counts the passes behind the banner, not just the failures', async () => {
    // `checks.length - failed - skipped` had no assertion on a run with BOTH, so
    // `+ failed` survived — and so did every rewrite of the arm that chooses this
    // banner. The ratio is the part a reader acts on.
    adopted();
    write('CLAUDE.blueprint.md', '# reference');

    let output = '';
    let json = '';

    await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });
    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (json = m) });

    expect(JSON.parse(json).counts).toEqual({ total: 7, passed: 5, failed: 1, skipped: 1 });
    // A failure outranks a skip in the verdict: rewrites of `verdictOf`'s failure test
    // all fall through to `unverified` on exactly this shape.
    expect(JSON.parse(json).verdict).toBe('incomplete');
    expect(output).toContain('1 of 7 check(s) failed');

    // The two arms this fixture is NOT in, so a rewrite that picks one of them is red.
    expect(output).not.toContain('Adoption complete');
    expect(output).not.toContain('Adoption unverified');
  });

  it('reaches both banners a run with nothing skipped can end on', async () => {
    // Every other fixture here skips the survival check (no eslint resolvable), so the
    // arm that chooses BETWEEN complete and the other two was never exercised: rewriting
    // `failed === 0 && !skipped` three different ways survived, and so did every rewrite
    // of `verdictOf`'s failure test. A layer-file pattern that yields no probe is the
    // cheap way in — that path returns ok with NO skip, deliberately, because the state
    // it reports is one doctor already states as vacuous.
    const noProbe = async () => ({
      ...vuePreset(),
      architecture: { ...vuePreset().architecture, layerFiles: 'src/{layer}/?.js' },
    });

    adopted();

    let complete = '';
    let json = '';

    const green = await runDoctor(root, { loadConfig: noProbe, log: (m) => (complete = m) });

    await runDoctor(root, { loadConfig: noProbe, json: true, log: (m) => (json = m) });

    expect(green.verdict).toBe('complete');
    expect(complete).toContain('✓ Adoption complete — all 7 checks passed.');
    expect(JSON.parse(json).counts).toEqual({ total: 7, passed: 7, failed: 0, skipped: 0 });

    // And one failure with still nothing skipped: the third arm, and the clause about
    // skips must NOT appear — there are none to leave unproven.
    write('CLAUDE.blueprint.md', '# reference');

    let red = '';

    const failing = await runDoctor(root, { loadConfig: noProbe, log: (m) => (red = m) });

    expect(failing.verdict).toBe('incomplete');
    expect(red).toContain('✗ Adoption incomplete — 1 of 7 check(s) failed.');
    expect(red).not.toContain('could not run');
  });

  it('gives the JSON the same banner and ratio the screen gets', async () => {
    // This fixture ends `⊘ unverified` (no eslint resolvable), and the JSON used to
    // carry `ok: true` and the bare word — so a machine that read `ok` and stopped saw
    // a plain green, while a reader saw "6 of 7 passed, 1 could not run". #141 added
    // `verdict`; the sentence and the ratio behind it stayed on one channel (#149).
    adopted();
    let text = '';
    let json = '';

    await runDoctor(root, { loadConfig: load, log: (m) => (text = m) });
    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (json = m) });

    const parsed = JSON.parse(json);

    expect(parsed.verdict).toBe('unverified');
    expect(parsed.counts).toEqual({ total: 7, passed: 6, failed: 0, skipped: 1 });
    // Byte-for-byte the line the reader gets, because two channels wording the same
    // verdict differently is how the reader and the automation start disagreeing.
    expect(text).toContain(parsed.summary);
    expect(parsed.summary).toContain('⊘ Adoption unverified');

    // `ok` stays "nothing FAILED" — the same thing this command's exit code means.
    // Flipping it on a skip would push a consumer following it into failing on a red
    // nobody can appease, which is exactly the state that produces the skip.
    expect(parsed.ok).toBe(true);
  });

  it('reports ok:false in JSON as soon as any check fails', async () => {
    write('blueprint.config.mjs', '// user config');
    let output = '';

    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (output = m) });

    // `ok` is EVERY check passing, not any of them. A git hook or CI job gates
    // on this field, and "some check passed" is true of almost any repo.
    expect(JSON.parse(output).ok).toBe(false);
  });
});

/**
 * A wired adoption in its OWN directory, and both halves of that are load-bearing.
 *
 * Wired with `emitLint`'s real entries because criterion 6 asks for the survival check
 * to RUN: `adopted()` writes `export default []`, which satisfies detect's
 * wired-by-text heuristic and then leaves the check nothing to compare, so the
 * comparison would be a measurement of the skip rather than of the field.
 *
 * Its own directory because eslint loads `eslint.config.mjs` through `import()`, which
 * Node caches by URL — a second config written to the same path is never re-read, and
 * these two blueprints emit DIFFERENT `ignores` entries, which is exactly what that
 * cache would hide.
 */
const WIRED_SOURCES: Record<string, string> = {
  'src/components/Button.vue': '<template><div /></template>',
  'src/services/api.ts': 'export const api = 1;',
  // The file the healthy entry holds out of probe candidacy, and the dead one does not.
  'src/components/Widget.gen.ts': 'export const widget = 1;',
};

function wiredRepo(blueprint: Blueprint, sources = WIRED_SOURCES): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-wired-'));

  wiredRoots.push(dir);

  const put = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };

  put('package.json', JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }));
  put('blueprint.config.mjs', '// user config');
  put('eslint.config.mjs', wiredEslintConfig(blueprint));

  put('tsconfig.json', JSON.stringify({
    compilerOptions: { paths: { '~app/*': ['./src/*'] } },
  }));

  for (const [rel, content] of Object.entries(sources)) {
    put(rel, content);
  }

  return dir;
}

/**
 * Two notes now ride under the banner rather than as checks, for one reason each
 * half of: neither can fail, and a check that is always green would push the count
 * the fixtures above state. Their own describe because the block above is at the
 * per-function line cap.
 */
describe('runDoctor · the notes under the banner', () => {
  it('reports a layerFilesIgnore entry that reaches nothing, without moving a check', async () => {
    // The field is compiled in one place — `pickProbes` — and nothing counted it, so
    // doctor printed the same bytes and the same exit code for a healthy glob and a
    // dead one. Under the banner, not as an eighth check: an info report cannot fail,
    // and an always-green check would push the count every fixture below states.
    adopted();
    write('src/components/Widget.gen.ts', 'export const w = 1;');

    let broken = '';
    let intact = '';

    const red = await runDoctor(root, { loadConfig: dead, log: (m) => (broken = m) });
    const green = await runDoctor(root, { loadConfig: healthy, log: (m) => (intact = m) });

    expect(broken).toContain('`architecture.layerFilesIgnore` — no file here matches');
    // The offending entry by name: a report that cannot be acted on is a report of
    // nothing, and a net of several globs cannot say which one to fix without it.
    expect(broken).toContain('`**/*.{gen`');

    // Info tier, measured the way the criterion states it: against the same run with
    // the glob spelled correctly, the ONLY movement is the added line. Verdict, check
    // count and `ok` — which the exit code follows — all stand still.
    expect(red.ok).toBe(green.ok);
    expect(red.verdict).toBe(green.verdict);
    expect(red.checks).toEqual(green.checks);

    expect(broken.split('\n').filter((line) => !intact.includes(line)))
      .toHaveLength(1);

    // Both resolutions and whose call it is — the same shape `unreachedTestGlobs` uses,
    // because a mistyped glob and files that have not landed measure identically.
    expect(broken).toContain('fix the glob, or leave it');
    expect(broken).toContain('owner\'s call');
    // NOT "runway": `missing-layer` and `owns-not-installed` can promise it because a
    // declaration ahead of the code arms itself when the code lands. This one may never.
    expect(broken).not.toContain('runway');
  });

  it('names both sets the entry was weighed against, and the effect that buys', async () => {
    // `pickProbes` compiles the field against a path it invents for a layer with no
    // files, as well as against the tree. Measured off the tree alone the cause clause
    // cannot carry this consequence: an entry reaching only the invented path holds a
    // probe out, and the sentence would be saying nothing is held out at all.
    adopted();

    let broken = '';

    await runDoctor(root, { loadConfig: dead, log: (m) => (broken = m) });

    expect(broken).toContain('neither does the stand-in path');
    expect(broken).toContain('picks its probe as if the entry were absent');
  });

  it('says nothing when every declared ignore entry reaches a file', async () => {
    // The measurement, not the spelling: this glob is well-formed AND reaches the
    // file, and a report here would fire on every healthy config that has one.
    adopted();
    write('src/components/Widget.gen.ts', 'export const w = 1;');

    let output = '';

    await runDoctor(root, { loadConfig: healthy, log: (m) => (output = m) });

    expect(output).not.toContain('layerFilesIgnore');
  });

  it('carries both banner notes as two lines, and one `note` on the JSON channel', async () => {
    // Two independent notes now ride under the banner. The text channel gets a line
    // each; the JSON keeps the single `note` key it has carried since #141, because
    // renaming it for a second sentence breaks a consumer keyed on the first.
    adopted();

    let output = '';
    let json = '';

    await runDoctor(root, { loadConfig: dead, log: (m) => (output = m) });
    await runDoctor(root, { loadConfig: dead, json: true, log: (m) => (json = m) });

    const note = JSON.parse(json).note as string;
    const lines = output.split('\n');
    const banner = lines.findIndex((line) => line.includes('Adoption'));

    // Both, under the banner, in the order the reader acts on them.
    expect(lines[banner + 1]).toContain('`architecture.layerFilesIgnore`');
    expect(lines[banner + 2]).toContain('nothing adoption wrote is committed');
    expect(lines).toHaveLength(banner + 3);

    expect(note).toContain('`architecture.layerFilesIgnore`');
    expect(note).toContain('nothing adoption wrote is committed');
    // One key, two sentences: the channels must not know different things.
    expect(note.split('\n')).toHaveLength(2);
  });

  it('measures the entry with eslint wired, so the survival check runs', async () => {
    // Criterion 6's own comparison, and the condition it states: `layerFilesIgnore` is
    // compiled only in `pickProbes`, behind THIS check, so the check has to be live for
    // the comparison to be about the field. At the parent commit these two runs were
    // byte-identical, banner and exit code included.
    const deadBp = wiredBlueprint(['**/*.{gen']);
    const healthyBp = wiredBlueprint(['**/*.{gen,generated}.ts']);

    let broken = '';
    let intact = '';

    const red = await runDoctor(
      wiredRepo(deadBp),
      { loadConfig: loads(deadBp), log: (m) => (broken = m) },
    );

    const green = await runDoctor(
      wiredRepo(healthyBp),
      { loadConfig: loads(healthyBp), log: (m) => (intact = m) },
    );

    // Ran, rather than skipped. The skip label shares the check's prefix, so demand the
    // verified verdict and the absence of the word.
    expect(broken).toContain('✓ emitted rules survive the merged eslint config (');
    expect(broken).not.toContain('skipped');

    expect(broken).toContain('`architecture.layerFilesIgnore` — no file here matches');
    expect(broken).toContain('`**/*.{gen`');
    expect(intact).not.toContain('layerFilesIgnore');

    // Info, not error: against the same run with the glob spelled correctly the ONLY
    // movement is the added line, and `ok` — which the exit code follows — and the
    // verdict both stand still.
    expect(red.ok).toBe(green.ok);
    expect(red.verdict).toBe(green.verdict);
    expect(broken.split('\n').filter((line) => !intact.includes(line))).toHaveLength(1);
  });

  it('stays silent when the entry swallowed a probe instead of reaching nothing', async () => {
    // The two trees where a files-only measurement would print a sentence its own run
    // denies. `pickProbes` applies the ignores a second time, to the stand-in path it
    // probes a layer with when that layer has no file: `src/**` over an empty tree takes
    // every probe and the check skips; `src/services/**` takes one and the check still
    // runs on the other. Neither entry is inert, so neither is reported.
    const all = wiredBlueprint(['src/**']);
    const one = wiredBlueprint(['src/services/**']);

    let swallowed = '';
    let partial = '';

    await runDoctor(wiredRepo(all, {}), { loadConfig: loads(all), log: (m) => (swallowed = m) });

    await runDoctor(
      wiredRepo(one, { 'src/components/Button.vue': '<template><div /></template>' }),
      { loadConfig: loads(one), log: (m) => (partial = m) },
    );

    // The contradiction this replaces, in one line each: the skip the entry caused, and
    // the check it left running — with no note calling the cause of either inert.
    expect(swallowed).toContain('skipped — no probe derivable from the layer globs');
    expect(swallowed).not.toContain('layerFilesIgnore');

    expect(partial).toContain('✓ emitted rules survive the merged eslint config (');
    expect(partial).not.toContain('layerFilesIgnore');
  });

  it('omits `note` entirely when there is nothing under the banner', async () => {
    // The empty arm. `notes.join('\n')` on an empty list is `''`, which serializes as
    // a key holding an empty string — a machine reading `note` would see a note.
    adopted();
    fs.mkdirSync(path.join(root, '.git'));

    let json = '';

    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (json = m) });

    expect('note' in JSON.parse(json)).toBe(false);
  });
});
