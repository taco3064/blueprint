import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

const load = async () => vuePreset();

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
