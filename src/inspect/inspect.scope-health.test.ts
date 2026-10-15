import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { runDeps } from './deps';
import { runDoctor } from './doctor';
import { runInspect } from './inspect';
import { BASELINE_FILE, renderBaseline } from './baseline';

let root: string;

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [{ name: 'app', does: 'composition' }, { name: 'shop', does: 'shop' }],
    layers: [{ name: 'components', does: 'UI', layout: 'file' }],
  },
};

function write(file: string, content: string): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-scope-health-'));
  write('package.json', JSON.stringify({ name: 'scope-fixture', dependencies: { react: '*' } }));
  write('blueprint.config.mjs', 'export default {};');
  write('src/app/index.ts', 'export {};');
  write('src/shop/components/Item.ts', 'export const item = 1;');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const options = { loadConfig: async () => blueprint, log: () => {} };

it.each([
  ['parse failure', 'const invalid: = 1;'],
  ['unresolved import', 'const target = process.env.TARGET; import(target);'],
])('inspect, baseline and doctor cannot certify outside %s', async (_, content) => {
  write('tools/Consumer.ts', content);
  const cleanBaseline = renderBaseline([]);

  write(BASELINE_FILE, cleanBaseline);

  for (const flags of [{}, { baseline: true }, { updateBaseline: true }]) {
    let output = '';
    const result = await runInspect(root, { ...options, ...flags, log: (text) => (output = text) });

    expect(result.ok).toBe(false);
    expect(output).toContain('Application scope: partial');
    expect(output).not.toContain('Architecture Success');
    expect(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf8')).toBe(cleanBaseline);
  }

  let output = '';
  const doctor = await runDoctor(root, { ...options, json: true, log: (text) => (output = text) });

  expect(doctor).toMatchObject({ ok: false, verdict: 'incomplete' });

  expect(doctor.checks.find((check) => check.label === 'Application source scope'))
    .toMatchObject({ ok: false });

  expect(JSON.parse(output).architectureFacts.outsideScope.status).toBe('partial');
});

it('baseline may ratchet proven relations without erasing unknown outside health', async () => {
  write('tools/Consumer.ts', 'import \'~app/shop/components/Item\';');
  const initial = await runInspect(root, options);

  write(BASELINE_FILE, renderBaseline(initial.findings));
  const ratcheted = await runInspect(root, { ...options, baseline: true });

  expect(ratcheted.ok).toBe(true);
  expect(ratcheted.findings).toEqual([]);
  write('tools/Unknown.ts', 'import(process.env.TARGET);');
  const incomplete = await runInspect(root, { ...options, baseline: true });

  expect(incomplete.findings).toEqual([]);
  expect(incomplete.ok).toBe(false);
});

it('inspect and doctor expose the same relation identity and measured health', async () => {
  write('tools/Consumer.ts', 'import \'~app/shop/components/Item\';');
  let inspectOutput = '';
  let doctorOutput = '';

  await runInspect(root, { ...options, json: true, log: (text) => (inspectOutput = text) });
  await runDoctor(root, { ...options, json: true, log: (text) => (doctorOutput = text) });
  const inspected = JSON.parse(inspectOutput);
  const diagnosed = JSON.parse(doctorOutput).architectureFacts;

  const identities = inspected.findings.filter((finding: { rule: string }) =>
    finding.rule === 'uncovered-application-source')
    .map(({ rule, path, subject }: { rule: string; path: string; subject: string }) =>
      ({ rule, path, subject }));

  expect(identities)
    .toEqual([{ rule: 'uncovered-application-source', path: 'src', subject: 'tools' }]);

  expect(diagnosed.applicationScope).toEqual(identities);
  expect(diagnosed.outsideScope).toEqual(inspected.outsideScope);
  expect(diagnosed.importAnalysis).toEqual(inspected.importAnalysis);
  expect(diagnosed.governedWork).toEqual({ inventoryFiles: 2, readFiles: 2, parsedFiles: 2 });
});

it('deps retains its graph without outside inventory or reading', async () => {
  write('tools/Broken.ts', 'const invalid: = 1;');
  const read = vi.spyOn(fs, 'readFileSync');
  const directories = vi.spyOn(fs, 'readdirSync');
  let output = '';

  const result = await runDeps(root, { ...options, json: true, log: (text) => (output = text) });

  expect(result.ok).toBe(true);
  expect(result.units.map((unit) => unit.unit)).toEqual(['app', 'shop/components']);
  expect(JSON.parse(output).importAnalysis).toMatchObject({ status: 'healthy', scannedFiles: 2 });

  expect(read.mock.calls.map(([file]) => String(file)))
    .toContain(path.join(root, 'src/shop/components/Item.ts'));

  expect(read.mock.calls.map(([file]) => String(file)))
    .not.toContain(path.join(root, 'tools/Broken.ts'));

  expect(directories.mock.calls.map(([file]) => String(file)))
    .not.toContain(path.join(root, 'tools'));
});

it('successful baseline recording retains filesystem fallback visibility', async () => {
  write('tools/Consumer.ts', 'import \'~app/shop/components/Item\';');
  let output = '';

  const result = await runInspect(root, {
    ...options, updateBaseline: true, log: (text) => (output = text),
  });

  expect(result.ok).toBe(true);
  expect(output).toContain('Application scope: complete (filesystem-fallback)');
  expect(output).toContain('Repository visibility is unavailable');
  expect(fs.existsSync(path.join(root, BASELINE_FILE))).toBe(true);
});

it('keeps template import text clean while rejecting an actual missing module', async () => {
  write('tools/example.ts', 'export const sample = `import \'./not-a-real-module\';`;');
  let output = '';
  const log = (text: string) => (output = text);
  const clean = await runInspect(root, { ...options, json: true, log });

  expect(clean.ok).toBe(true);
  expect(JSON.parse(output).outsideScope).toMatchObject({ status: 'complete', limitations: [] });
  write('tools/example.ts', 'import \'./not-a-real-module\';');
  const missing = await runInspect(root, { ...options, json: true, log });

  expect(missing.ok).toBe(false);

  expect(JSON.parse(output).outsideScope).toMatchObject({
    status: 'partial',
    limitations: ['tools/example.ts: unresolved project reference tools/not-a-real-module'],
  });
});
