import { expect, it } from 'vitest';

import { renderDoctorCheck } from './doctor';
import { renderDoctorReport } from './doctor-report';

it.each([false, true])('renders ignored probes and losses with exclusive counts: %s', (mixed) => {
  const check = renderDoctorCheck({
    kind: 'wiring-ignored', label: 'merged rule survival',
    ignored: ['src/assets/iconfont.js', 'src/assets/vendor.js'],
    lost: mixed ? ['views: no-restricted-imports lost 3 structural pattern group(s)'] : [],
  });

  const checks = [renderDoctorCheck({ kind: 'config', present: true }), check];
  const text = renderDoctorReport(checks, {});
  const json = JSON.parse(renderDoctorReport(checks, { json: true }));

  expect(text).toContain(`${mixed ? '✗' : '⊘'} merged rule survival`);
  expect(text).toContain('src/assets/iconfont.js, src/assets/vendor.js');

  expect(json.counts).toEqual({
    total: 2, passed: 1, failed: Number(mixed), skipped: Number(!mixed),
  });

  expect(json.verdict).toBe(mixed ? 'incomplete' : 'unverified');

  if (mixed) {
    expect(text).toContain('views: no-restricted-imports lost 3 structural pattern group(s)');
    expect(text).toContain('1 of 2 check(s) failed.');
    expect(check.skipped).toBeUndefined();
  } else {
    expect(text).toContain('1 of 2 checks passed, 1 could not run');
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
