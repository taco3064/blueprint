import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { detect } from '../project';
import {
  assessmentApplication, assessmentBaseline, doctorAssessmentItems, inspectAssessmentBaseline,
  verdictOf,
} from './assessment-runtime';
import { BASELINE_FILE, renderBaseline } from './baseline';
import type { DoctorCheck, Finding } from './types';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assessment-runtime-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('uses canonical repository identity with an absent repository fallback', () => {
  const state = detect(root);

  expect(assessmentApplication(root, { ...state, repositoryRoot: undefined })).toBe('.');
  expect(assessmentApplication(root, { ...state, repositoryRoot: root })).toBe('.');

  expect(assessmentApplication(path.join(root, 'apps', 'shop'), {
    ...state, repositoryRoot: root,
  })).toBe('apps/shop');
});

const finding = (subject: string): Finding => ({
  rule: 'undeclared-folder', path: 'src', subject, severity: 'error', message: subject,
});

it('retains all current findings without a baseline and handles an empty current set', () => {
  const findings = [finding('old'), finding('new')];

  expect(assessmentBaseline(root, findings)).toEqual({
    fresh: findings, debt: [], suppressed: 0, stale: 0,
  });

  expect(assessmentBaseline(root, [])).toEqual({ fresh: [], debt: [], suppressed: 0, stale: 0 });
});

it('identifies baseline debt independently of wording and severity', () => {
  const old = finding('old');
  const fresh = finding('new');

  fs.writeFileSync(path.join(root, BASELINE_FILE), renderBaseline([old, finding('gone')]));
  const changed = { ...old, message: 'changed', severity: 'warn' as const };

  expect(assessmentBaseline(root, [changed, fresh])).toEqual({
    fresh: [fresh], debt: [changed], suppressed: 1, stale: 1,
  });
});

it('rejects an unreadable baseline rather than claiming clean conformance', () => {
  fs.writeFileSync(path.join(root, BASELINE_FILE), 'invalid');
  expect(() => assessmentBaseline(root, [finding('old')])).toThrow();
});

it.each([
  { ok: true, status: 'passed', affectsExit: false },
  { ok: false, status: 'failed', affectsExit: true },
  { ok: true, skipped: 'unavailable', status: 'unverified', affectsExit: false },
  { ok: false, skipped: 'unavailable', status: 'failed', affectsExit: true },
  { ok: true, skipped: '', status: 'passed', affectsExit: false },
] as const)('preserves gate compatibility for $status with ok=$ok skipped=$skipped', (test) => {
  const check: DoctorCheck = {
    sourceKey: 'lint', label: 'Lint', ok: test.ok,
    ...('skipped' in test ? { skipped: test.skipped } : {}),
  };

  const skipped = 'skipped' in test ? test.skipped : undefined;

  expect(doctorAssessmentItems('apps/shop', [check])).toEqual([{
    id: 'doctor-check', application: 'apps/shop', sourceKey: 'lint', subject: 'Lint',
    lane: 'gate', status: test.status, claim: 'Lint', source: 'doctor-check',
    evidence: check, reach: null, limitations: skipped ? [skipped] : [], signals: [],
    affectsExit: test.affectsExit, nextStep: skipped ?? null,
  }]);
});

it('prefers skipped explanation then detail then null while preserving empty detail', () => {
  const checks = [
    { sourceKey: 'a', label: 'A', ok: true, skipped: 'skip', detail: 'detail' },
    { sourceKey: 'b', label: 'B', ok: true, detail: 'detail' },
    { sourceKey: 'c', label: 'C', ok: true, detail: '' },
    { sourceKey: 'd', label: 'D', ok: true },
  ];

  expect(doctorAssessmentItems('.', checks).map((item) => item.nextStep))
    .toEqual(['skip', 'detail', '', null]);

  expect(doctorAssessmentItems('.', [])).toEqual([]);
});

it('rejects absent identity and distinguishes repeated labels', () => {
  expect(() => doctorAssessmentItems('.', [{ label: 'Lint', ok: true }])).toThrow();

  expect(doctorAssessmentItems('.', [
    { sourceKey: 'lint\0src/a', label: 'Lint', ok: true },
    { sourceKey: 'lint\0src/b', label: 'Lint', ok: false },
  ]).map((item) => item.sourceKey)).toEqual(['lint\0src/a', 'lint\0src/b']);
});

it.each([
  [[], 'complete'],
  [[{ label: 'a', ok: true }], 'complete'],
  [[{ label: 'a', ok: true, skipped: 'missing' }], 'unverified'],
  [[{ label: 'a', ok: false, skipped: 'missing' }], 'incomplete'],
] as const)('retains legacy verdict for %j', (checks, expected) => {
  expect(verdictOf([...checks])).toBe(expected);
});

it('optional baseline evidence retains findings when the reader throws a non-Error value', () => {
  fs.writeFileSync(path.join(root, BASELINE_FILE), renderBaseline([]));

  const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
    throw 'reader failed';
  });

  try {
    expect(inspectAssessmentBaseline(root, [finding('fresh')], false)).toEqual({
      fresh: [finding('fresh')], debt: [], suppressed: 0, stale: 0, error: 'reader failed',
    });

    expect(() => inspectAssessmentBaseline(root, [], true)).toThrow('reader failed');
  } finally {
    read.mockRestore();
  }
});
