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

  it('demands an existing baseline and supports JSON output', async () => {
    await expect(runInspect(root, { baseline: true, log: silent })).rejects.toThrow(
      /--update-baseline/,
    );

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
