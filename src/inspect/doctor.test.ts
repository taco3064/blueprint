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

/** A finished adoption: config, a wired eslint config, no reference files. */
function adopted(): void {
  write('blueprint.config.mjs', '// user config');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');
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
    expect(output).toContain('Adoption complete — all 4 checks passed');
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

  it('emits machine-readable JSON with --json', async () => {
    adopted();
    let output = '';

    await runDoctor(root, { loadConfig: load, json: true, log: (m) => (output = m) });

    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });
});
