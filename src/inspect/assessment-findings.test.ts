import { renderAssessmentClaim } from '../operational-contract';
import { expect, it } from 'vitest';
import { findingAssessmentItems } from './assessment-findings';
import { findingIdentity } from './types';
import type { Finding } from './types';

const finding: Finding = { rule: 'flow-violation', path: 'src/a.ts', subject: '@/b',
  message: 'wrong direction', severity: 'error' };

it.each([
  ['error', false, 'conformance', 'failed', true, 2],
  ['warn', false, 'conformance', 'failed', false, 1],
  ['info', false, 'reach', 'not-applicable', false, 1],
  ['error', true, 'conformance', 'known-debt', false, 1],
  ['warn', true, 'conformance', 'known-debt', false, 1],
  ['info', true, 'reach', 'not-applicable', false, 1],
] as const)('maps %s suppressed=%s with exit compatibility', (...args) => {
  const [severity, debt, lane, status, affectsExit, length] = args;
  const fact = { ...finding, severity };
  const result = findingAssessmentItems('apps/web', debt ? [] : [fact], debt ? [fact] : []);

  expect(result).toHaveLength(length);

  expect(result[0]).toEqual({
    application: 'apps/web', id: 'inspect-finding', sourceKey: findingIdentity(fact),
    subject: fact.path, lane, status, affectsExit, evidence: fact,
    source: 'inspect.finding', claim: renderAssessmentClaim('inspect-finding'), reach: null,
    limitations: [], signals: [], nextStep: null,
  });

  if (affectsExit) {
    expect(result[1]).toEqual({ ...result[0], id: 'inspect-gate', lane: 'gate', status: 'failed' });
  }
});

it.each(['error',
  'warn', 'info'] as const)('keeps module uncertainty unverified at %s severity', (severity) => {
  const fact = { ...finding, severity, rule: 'module-dependency-unverified' };
  const result = findingAssessmentItems('.', [fact], []);

  expect(result[0]).toMatchObject({ lane: 'reach', status: 'unverified', reach: 'partial' });

  expect(result.map((item) => [item.lane, item.status])).toEqual(severity === 'error'
    ? [['reach', 'unverified'], ['gate', 'unverified']]
    : [['reach', 'unverified']]);
});

it('retains distinct importer and target identity while rewording keeps the key stable', () => {
  const result = findingAssessmentItems('.', [finding,
    { ...finding, path: 'src/other.ts' }, { ...finding, subject: '@/c' }], []);

  expect(new Set(result.map((item) => `${item.id}:${item.sourceKey}`)).size).toBe(6);

  expect(findingAssessmentItems('.', [{ ...finding, message: 'new prose', severity: 'warn' }],
    [])[0].sourceKey)
    .toBe(result[0].sourceKey);
});
