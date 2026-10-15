import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runInspect } from './inspect';
import { runDoctor } from './doctor';
import { BASELINE_FILE, renderBaseline } from './baseline';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-inspect-assessment-'));
  write('package.json', JSON.stringify({ dependencies: { vue: '^3' } }));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, content = ''): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

it('shares assessment across human, JSON and API output', async () => {
  write('src/components/Widget/Widget.vue', '<template><div /></template>');
  let human = '';
  let json = '';
  const options = { loadConfig: async () => vuePreset() };

  const displayed = await runInspect(root, { ...options, log: (line) => {
    human = line;
  } });

  const encoded = await runInspect(root, { ...options, json: true, log: (line) => {
    json = line;
  } });

  expect(encoded.assessment).toEqual(displayed.assessment);
  expect(JSON.parse(json).assessment).toEqual(encoded.assessment);
  expect(encoded.ok).toBe(true);
  expect(encoded.assessment.review.status).toBe('required');
  expect(human).toContain('Semantic review: required');
  expect(human).not.toContain('Adoption complete');
  expect(encoded.assessment.items.every((item) => item.application === '.')).toBe(true);
});

it('preserves debt across legacy exit policies', async () => {
  write('src/utils/Bad.ts', 'export const bad = 1;');
  const options = { loadConfig: async () => vuePreset(), log: () => {} };
  const initial = await runInspect(root, options);

  expect(initial.ok).toBe(false);
  fs.writeFileSync(path.join(root, BASELINE_FILE), renderBaseline(initial.findings));
  const strict = await runInspect(root, options);
  let json = '';

  const baseline = await runInspect(root, { ...options, baseline: true, json: true,
    log: (line) => {
      json = line;
    } });

  expect([strict.ok, baseline.ok, strict.assessment.gates.status, baseline.assessment.gates.status])
    .toEqual([false, true, 'failed', 'passed']);

  expect(baseline.assessment.conformance.baselinedDebt).toBe(1);
  expect(baseline.assessment.conformance.freshViolations).toBe(0);
  expect(JSON.parse(json).assessment).toEqual(baseline.assessment);

  expect(strict.assessment.items.filter((item) => item.id === 'inspect-baseline-policy'))
    .toEqual([expect.objectContaining({ lane: 'gate', status: 'failed',
      evidence: initial.findings,
      limitations: [], signals: [], affectsExit: true, reach: null, nextStep: null })]);

  expect(baseline.assessment.items.filter((item) => item.id === 'inspect-baseline-policy'))
    .toEqual([]);
});

it('assesses the updated baseline after repairing its old version', async () => {
  write('src/utils/Bad.ts', 'export const bad = 1;');
  write(BASELINE_FILE, 'invalid');
  let json = '';

  const updated = await runInspect(root, { updateBaseline: true, json: true,
    loadConfig: async () => vuePreset(), log: (line) => {
      json = line;
    } });

  expect(updated.ok).toBe(true);
  expect(updated.assessment.conformance.freshViolations).toBe(0);
  expect(updated.assessment.conformance.baselinedDebt).toBe(1);
  expect(updated.assessment.gates.status).toBe('passed');
  expect(JSON.parse(json).assessment).toEqual(updated.assessment);
});

it('Doctor missing config shares JSON and API evidence', async () => {
  let json = '';

  const result = await runDoctor(root, { json: true, log: (line) => {
    json = line;
  } });

  expect(result.ok).toBe(false);
  expect(result.gateVerdict).toBe('incomplete');
  expect(result.verdict).toBe(result.gateVerdict);
  expect(result.assessment.gates).toEqual({ status: 'failed', failed: 1, unverified: 0 });
  expect(result.assessment.items).toHaveLength(1);
  expect(result.workflowAssessments).toEqual([]);
  expect(JSON.parse(json).workflowAssessments).toEqual([]);
  expect(result.assessment.items[0]).toMatchObject({ application: '.', affectsExit: true });
  expect(JSON.parse(json).assessment).toEqual(result.assessment);
});

it('Doctor and Inspect share review-only prohibition identity', async () => {
  write('blueprint.config.mjs');
  write('src/components/Widget.vue', '<template><div /></template>');
  const blueprint = vuePreset();

  blueprint.rules = {};

  blueprint.architecture.layers = [{ name: 'components', does: 'UI', layout: 'file',
    mustNot: ['own product decisions', 'own product decisions'] }];

  const options = { loadConfig: async () => blueprint, log: () => {} };
  const inspected = await runInspect(root, options);
  const diagnosed = await runDoctor(root, options);

  const relevant = (result: typeof inspected.assessment) => result.items.filter((item) =>
    item.source === 'inspect.prohibition');

  expect(relevant(inspected.assessment)).toHaveLength(2);
  expect(relevant(diagnosed.assessment)).toEqual(relevant(inspected.assessment));
});

it.each([undefined, false])(
  'ordinary Inspect preserves exit with unreadable baseline and baseline=%s', async (baseline) => {
    write('src/components/Widget.vue', '<template><div /></template>');
    write(BASELINE_FILE, 'invalid');
    const options = { loadConfig: async () => vuePreset(), log: () => {} };
    const result = await runInspect(root, { ...options, baseline });

    expect(result.ok).toBe(true);
    expect(result.assessment.gates.status).toBe('unverified');
    expect(result.assessment.conformance.baselinedDebt).toBe(0);

    expect(result.assessment.items.filter((item) => item.id === 'baseline-evidence'))
      .toEqual([expect.objectContaining({ status: 'unverified', lane: 'gate',
        affectsExit: false, reach: null, evidence: { error: expect.stringContaining('JSON') },
        limitations: [expect.stringContaining('JSON')], signals: [] })]);

    await expect(runInspect(root, { ...options, baseline: true })).rejects.toThrow();
  });

it('retains strict baseline refusal when degraded scope prevents replacing an invalid ledger',
  async () => {
    write('src/components/Widget.vue', '<template><div /></template>');
    write('src/components/Broken.ts', 'const invalid: = 1;');
    write(BASELINE_FILE, 'invalid');
    const options = { loadConfig: async () => vuePreset(), updateBaseline: true, log: () => {} };
    const result = await runInspect(root, options);

    expect(result.ok).toBe(false);

    expect(result.assessment.items.find((item) => item.id === 'baseline-evidence'))
      .toMatchObject({ status: 'unverified', limitations: [expect.stringContaining('JSON')] });

    await expect(runInspect(root, { ...options, baseline: true })).rejects.toThrow();
    expect(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf8')).toBe('invalid');
  });

it('a valid empty baseline produces no unavailable-evidence item in ordinary Inspect', async () => {
  write(BASELINE_FILE, renderBaseline([]));
  const result = await runInspect(root, { loadConfig: async () => vuePreset(), log: () => {} });

  expect(result.ok).toBe(true);
  expect(result.assessment.gates.status).toBe('passed');
  expect(result.assessment.items.filter((item) => item.id === 'baseline-evidence')).toEqual([]);
});
