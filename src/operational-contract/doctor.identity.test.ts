import { expect, it } from 'vitest';
import { renderDoctorCheck } from './doctor';
import type { DoctorCheckFact } from './doctor';

it.each([
  [{ kind: 'config', present: true }, 'config\0'],
  [{ kind: 'config', present: false }, 'config\0'],
  [{ kind: 'suppressions', status: 'unused' }, 'suppressions\0eslint-suppressions.json'],
  [{ kind: 'suppressions', status: 'valid', ledger: 'tools/ledger.json' },
    'suppressions\0tools/ledger.json'],
  [{ kind: 'suppressions', status: 'valid', ledger: '' }, 'suppressions\0'],
  [{ kind: 'wiring-unwired' }, 'wiring\0'],
  [{ kind: 'wiring-survives', label: 'renamed', scope: 'all', unreadable: 0 }, 'wiring\0'],
] satisfies [DoctorCheckFact, string][])('retains stable source identity for %j', (fact,
  expected) => {
  expect(renderDoctorCheck(fact).sourceKey).toBe(expected);
});

it.each(['typescript', 'bundler-runtime', 'package-subpath', 'test-runner'] as const)(
  'distinguishes the %s alias consumer independently of its status', (consumer) => {
    for (const status of ['verified', 'unverified'] as const) {
      expect(renderDoctorCheck({
        kind: 'alias-consumer', sourceRoot: 'src',
        evidence: { consumer, status, aliases: [], files: [] },
      }).sourceKey).toBe(`alias-consumer\0${consumer}`);
    }
  },
);
