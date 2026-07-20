import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInspect } from './inspect';
import { vuePreset } from '../presets';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-inspect-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSrc(rel: string, content = ''): void {
  const full = path.join(root, 'src', rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('runInspect', () => {
  it('reports violations for a dirty project and returns ok=false', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    writeSrc('components/Btn/Btn.ts', 'import { api } from \'~app/services/api\';');

    const { findings, ok } = await runInspect(root, { log: silent });
    const rules = findings.map((finding) => finding.rule);

    expect(ok).toBe(false);
    expect(rules).toContain('undeclared-folder');
    expect(rules).toContain('flow-violation');
  });

  it('returns ok=true for a clean scaffolded project', async () => {
    for (const layer of vuePreset().architecture.layers) {
      fs.mkdirSync(path.join(root, 'src', layer.name), { recursive: true });
    }

    const { ok } = await runInspect(root, { log: silent });

    expect(ok).toBe(true);
  });

  it('emits JSON when asked', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    let output = '';

    await runInspect(root, { json: true, log: (message) => (output = message) });
    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(false);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });
});

describe('runInspect · baseline ratchet', () => {
  it('locks existing debt, then fails only on new findings', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');

    // Record the debt.
    const update = await runInspect(root, { updateBaseline: true, log: silent });

    expect(update.ok).toBe(true);
    expect(fs.existsSync(path.join(root, '.blueprint-baseline.json'))).toBe(true);

    // Same state → clean under the baseline.
    const clean = await runInspect(root, { baseline: true, log: silent });

    expect(clean.ok).toBe(true);
    expect(clean.findings).toEqual([]);

    // A NEW violation → only it surfaces, and it fails the run.
    writeSrc('components/Btn/Btn.ts', 'import { api } from \'~app/services/api\';');

    let output = '';
    const dirty = await runInspect(root, { baseline: true, log: (m) => (output = m) });

    expect(dirty.ok).toBe(false);
    expect(dirty.findings.map((f) => f.rule)).toContain('flow-violation');
    expect(dirty.findings.map((f) => f.rule)).not.toContain('undeclared-folder');
    expect(output).toContain('baselined finding(s) suppressed');
  });

  it('reports stale entries so the ratchet can tighten', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    // Pay the debt down.
    fs.rmSync(path.join(root, 'src', 'utils'), { recursive: true, force: true });

    let output = '';
    const { ok } = await runInspect(root, { baseline: true, log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(output).toContain('no longer occur');
  });

  it('treats a missing baseline file as empty — every finding is fresh', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');

    const { ok, findings } = await runInspect(root, { baseline: true, log: silent });

    expect(ok).toBe(false); // undeclared folder — fresh, nothing suppressed
    expect(findings.length).toBeGreaterThan(0);
  });

  it('locks a baseline and supports JSON output', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    let output = '';

    await runInspect(root, { baseline: true, json: true, log: (m) => (output = m) });
    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(parsed.suppressed).toBeGreaterThan(0);
    expect(parsed.stale).toBe(0);
  });
});

describe('runInspect · test files are exempt from structure', () => {
  it('ignores same-layer alias imports and cross-module escapes inside tests', async () => {
    // The miniapp scenario: a co-located test importing its sibling via the
    // alias — legal test plumbing, not an architecture violation.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('services/api/api.test.ts', 'import { api } from \'~app/services/api\';');
    writeSrc('components/Btn/Btn.spec.ts', 'import { api } from \'~app/services/api\';');

    const { findings, ok } = await runInspect(root, { log: silent });

    expect(ok).toBe(true);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('does not flag a folder whose only code is tests, and honors overrides', async () => {
    writeSrc('legacy/old.test.ts', 'export {};');

    const clean = await runInspect(root, { log: silent });

    expect(clean.findings.map((f) => f.rule)).not.toContain('undeclared-folder');

    // Narrow the test globs — .test files become plain source again.
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const { vuePreset } = await import('../presets');
    const bp = vuePreset();

    const strict = await runInspect(root, {
      log: silent,
      loadConfig: async () => ({
        ...bp,
        architecture: { ...bp.architecture, testFiles: '**/*.spec.ts' },
      }),
    });

    expect(strict.findings.map((f) => f.rule)).toContain('undeclared-folder');
  });
});

describe('runInspect · zero-finding baseline hygiene', () => {
  it('writes no baseline on a clean repo and retires a paid-off one', async () => {
    const baseline = path.join(root, '.blueprint-baseline.json');
    let output = '';

    // Truly clean: every declared layer folder exists, no files, no findings.
    for (const layer of vuePreset().architecture.layers) {
      fs.mkdirSync(path.join(root, 'src', layer.name), { recursive: true });
    }

    await runInspect(root, { updateBaseline: true, log: (m) => (output = m) });
    expect(fs.existsSync(baseline)).toBe(false);
    expect(output).toContain('no baseline needed');

    // Accrue debt, lock it, pay it off — the ratchet retires itself.
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });
    expect(fs.existsSync(baseline)).toBe(true);

    fs.rmSync(path.join(root, 'src', 'utils'), { recursive: true, force: true });
    await runInspect(root, { updateBaseline: true, log: (m) => (output = m) });

    expect(fs.existsSync(baseline)).toBe(false);
    expect(output).toContain('removed');
  });
});
