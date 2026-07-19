import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInspect } from './main';
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
