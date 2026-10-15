import { expect, it } from 'vitest';

import { renderDoctorCheck } from './doctor';
import { deriveAdoptionAssessment } from '../inspect/adoption-assessment';
import { doctorAssessmentItems } from '../inspect/assessment-runtime';
import { renderDoctorReport } from './doctor-report';

it.each([false, true])('renders ignored probes and losses with exclusive counts: %s', (mixed) => {
  const check = renderDoctorCheck({
    kind: 'wiring-ignored', label: 'merged rule survival',
    ignored: ['src/assets/iconfont.js', 'src/assets/vendor.js'],
    lost: mixed ? ['views: no-restricted-imports lost 3 structural pattern group(s)'] : [],
  });

  const checks = [renderDoctorCheck({ kind: 'config', present: true }), check];

  const assessment = deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems('.', checks));

  const text = renderDoctorReport(checks, { assessment });
  const json = JSON.parse(renderDoctorReport(checks, { json: true, assessment }));

  expect(text).toContain(`${mixed ? '✗' : '⊘'} merged rule survival`);
  expect(text).toContain('src/assets/iconfont.js, src/assets/vendor.js');

  expect(json.counts).toEqual({
    total: 2, passed: 1, failed: Number(mixed), skipped: Number(!mixed),
  });

  expect(json.verdict).toBe(mixed ? 'incomplete' : 'unverified');

  if (mixed) {
    expect(text).toContain('views: no-restricted-imports lost 3 structural pattern group(s)');
    expect(text).toContain('Adoption blocked: executable gates failed.');
    expect(check.skipped).toBeUndefined();
  } else {
    expect(text).toContain('Adoption unverified: required executable evidence could not run.');
    expect(check.detail).toBeUndefined();
  }
});

it.each([[], ['CLAUDE.blueprint.md']])('allows omitted retained: %j', (...references) => {
  const check = renderDoctorCheck({ kind: 'leftovers', references, authoring: [], stale: [] });

  expect(check.ok).toBe(references.length === 0);

  expect(check.detail).toBe(references.length
    ? 'merge and delete: CLAUDE.blueprint.md — adoption is not done while a reference remains'
    : undefined);
});

it('does not invent finding lines for a check without prohibition findings', () => {
  const checks = [renderDoctorCheck({ kind: 'config', present: true })];

  const assessment = deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems('.', checks));

  const output = renderDoctorReport(checks, { assessment });

  expect(output).toContain('✓ blueprint.config.mjs present');
  expect(output).toContain('Gates passed; Blueprint found no known review item');
  expect(output).not.toContain('severity:');
  expect(output).not.toContain('Adoption complete');
});

it('renders workflow evidence separately without overriding current-config facts', () => {
  const checks = [renderDoctorCheck({ kind: 'config', present: true })];

  const current = deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems('.', checks));

  const workflow = { ...current, scope: 'topology-transformation' as const,
    headline: 'blocked' as const,
    gates: { status: 'failed' as const, failed: 1, unverified: 0 } };

  const report = { assessment: current, workflowAssessments: [workflow] };
  const json = JSON.parse(renderDoctorReport(checks, { ...report, json: true }));
  const text = renderDoctorReport(checks, report);

  expect(json.assessment).toEqual(current);
  expect(json.workflowAssessments).toEqual([workflow]);
  expect(json.gateVerdict).toBe('complete');
  expect(json.summary).toContain('Gates passed; Blueprint found no known review item');

  expect(text.indexOf('Assessment scope: current-config-adoption')).toBeLessThan(
    text.indexOf('Assessment scope: topology-transformation'),
  );

  expect(text).toContain('Executable gates: failed (1 failed, 0 unverified)');

  expect(JSON.parse(renderDoctorReport(checks, { assessment: current,
    json: true })).workflowAssessments)
    .toEqual([]);
});
