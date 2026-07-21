import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

const silent = () => {};

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

describe('runDoctor', () => {
  it('fails fast with a single check when there is no config', async () => {
    let output = '';

    const { ok, checks } = await runDoctor(root, { log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(checks).toHaveLength(1);
    expect(checks[0].detail).toContain('blueprint init');
    expect(output).toContain('✗ blueprint.config.mjs present');
  });

  it('passes every check on a finished adoption', async () => {
    adopted();
    let output = '';

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(output).toContain('Adoption complete — all 6 checks passed');
  });

  it('flags a leftover reference file', async () => {
    adopted();
    write('CLAUDE.blueprint.md', '# reference');
    let output = '';

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(checks.find((c) => c.label.includes('reference'))?.detail).toContain('CLAUDE.blueprint.md');
    expect(output).toContain('Adoption incomplete');
  });

  it('flags eslint not wired to emitLint', async () => {
    write('blueprint.config.mjs', '// user config');
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(ok).toBe(false);
    expect(checks.find((c) => c.label.includes('eslint'))?.detail).toContain('...emitLint(blueprint)');
  });

  it('names the flat-config migration for a legacy .eslintrc', async () => {
    write('blueprint.config.mjs', '// user config');
    write('.eslintrc.cjs', 'module.exports = {};');
    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(checks.find((c) => c.label.includes('eslint'))?.detail).toContain('migrate to flat config');
  });

  it('flags a declared alias no toolchain resolves, with the wiring snippet', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });

    const check = checks.find((c) => c.label.includes('alias'));

    expect(ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('"~app/*": ["./src/*"]');
    expect(check?.detail).toContain('unresolvable imports');
  });

  it('targets the project root in the wiring snippet when sourceRoot is "."', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    const flat = async () => {
      const preset = vuePreset();

      return { ...preset, architecture: { ...preset.architecture, sourceRoot: '.' } };
    };

    const { checks } = await runDoctor(root, { loadConfig: flat, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.detail).toContain('"~app/*": ["./*"]');
  });

  it('accepts an alias wired through the vite config text', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));
    write('vite.config.ts', 'export default { resolve: { alias: { \'~app\': \'/src\' } } };');

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.ok).toBe(true);
  });

  it('states the coverage on a clean gate, and calls out a vacuous one', async () => {
    adopted();
    write('src/components/Button.vue', 'export default {};');

    let { checks } = await runDoctor(root, { loadConfig: load, log: silent });
    let check = checks.find((c) => c.label.includes('architecture'));

    expect(check?.ok).toBe(true);
    expect(check?.detail).toContain('1/1 source files inside layer nets');

    // Only root wiring exists → the net catches nothing, and the green says so.
    fs.rmSync(path.join(root, 'src/components/Button.vue'));
    write('src/main.ts', 'export {};');

    ({ checks } = await runDoctor(root, { loadConfig: load, log: silent }));
    check = checks.find((c) => c.label.includes('architecture'));

    expect(check?.ok).toBe(true);
    expect(check?.detail).toContain('clean, but vacuous');
  });

  it('flags findings that sit outside the baseline', async () => {
    adopted();
    write('src/random/x.ts', 'export const x = 1;'); // undeclared folder → error finding
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(ok).toBe(false);
    expect(checks.find((c) => c.label.includes('architecture'))?.detail).toContain('outside the baseline');
  });

  it('counts baselined findings as clean', async () => {
    adopted();
    write('src/random/x.ts', 'export const x = 1;'); // undeclared folder → 1 finding

    // Record that finding as accepted debt — doctor should now read clean.
    write(
      '.blueprint-baseline.json',
      JSON.stringify({
        findings: [
          {
            rule: 'undeclared-folder',
            path: 'src/random',
            message:
              '"random" is not a declared layer — declare it, or move its code into a module of an existing layer.',
          },
        ],
      }),
    );

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(checks.find((c) => c.label.includes('architecture'))?.ok).toBe(true);
  });

  it('passes the suppressions check when the ledger is absent, current, or fails when stale', async () => {
    adopted();

    // Absent: not in use — fine.
    let result = await runDoctor(root, { loadConfig: load, log: silent });

    expect(result.checks.find((c) => c.label.includes('suppressions'))?.ok).toBe(true);

    // Current: every suppressed file still exists.
    write('src/components/Big.vue', 'x');

    write('eslint-suppressions.json', JSON.stringify({
      'src/components/Big.vue': { 'max-lines': { count: 1 } },
    }));

    result = await runDoctor(root, { loadConfig: load, log: silent });
    expect(result.checks.find((c) => c.label.includes('suppressions'))?.ok).toBe(true);

    // Stale: a suppressed file is gone.
    write('eslint-suppressions.json', JSON.stringify({
      'src/components/Gone.vue': { 'max-lines': { count: 1 } },
    }));

    result = await runDoctor(root, { loadConfig: load, log: silent });

    const check = result.checks.find((c) => c.label.includes('suppressions'));

    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('prune-suppressions');

    // Unreadable: not JSON.
    write('eslint-suppressions.json', 'not json');
    result = await runDoctor(root, { loadConfig: load, log: silent });

    expect(result.checks.find((c) => c.label.includes('suppressions'))?.detail).toContain(
      'not valid JSON',
    );
  });

  it('emits machine-readable JSON with --json', async () => {
    adopted();
    let output = '';

    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (output = m) });

    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });
});
