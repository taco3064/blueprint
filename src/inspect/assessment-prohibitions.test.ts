import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import { expect, it } from 'vitest';
import type { ProhibitionFact } from './prohibitions';
import type { ProhibitionEvidence } from './prohibition-wiring';
import { prohibitionAssessmentItems } from './assessment-prohibitions';

const fact: ProhibitionFact = {
  declarationSlot: 0, layer: 'views', id: 'no-network', description: 'Do not fetch',
  mode: 'executable', status: 'active', checks: [], enforcedBy: 'lint',
  limitations: ['bounded detector'], reach: 'covered', exempt: [], severity: 'error',
  ruleId: 'blueprint/must-not', position: 'shop/views', files: ['src/shop/views/*.ts'],
  ignores: [], matchedFiles: ['src/shop/views/A.ts'], lintIntegration: 'verified',
};

const measured = (gate: ProhibitionEvidence['gate'],
  extra: Partial<ProhibitionEvidence> = {}): ProhibitionEvidence => ({
  ...fact, gate, affectsExit: gate === 'failed', ...extra,
});

it.each([
  ['passed', false], ['failed', true], ['unverified', false],
] as const)('retains source-owned %s gate and its exit policy', (gate, affectsExit) => {
  const source = measured(gate);

  expect(prohibitionAssessmentItems('apps/web', [source])).toEqual([{
    application: 'apps/web', id: 'must-not-executable', sourceKey: '["shop/views","no-network"]',
    subject: 'shop/views', source: 'inspect.prohibition', evidence: { fact: source,
      measurements: [source] },
    lane: 'gate', status: gate, claim: renderAssessmentClaim('must-not-executable'),
    reach: 'covered',
    limitations: ['bounded detector'], signals: [], affectsExit, nextStep: null,
  }]);
});

it('unmeasured executable evidence is unverified rather than a passing detector', () => {
  expect(prohibitionAssessmentItems('.', [fact])[0]).toMatchObject({
    lane: 'gate', status: 'unverified', affectsExit: false,
  });
});

it.each(['vacuous',
  'runway'] as const)('unoccupied %s positions remain declaratory for both modes', (reach) => {
  const executable = measured('failed', { reach });
  const review: ProhibitionFact = { ...fact, id: null, mode: 'review-only', reach };
  const result = prohibitionAssessmentItems('.', [executable, review]);

  expect(result.map((item) => [item.id, item.lane, item.status, item.reach, item.affectsExit]))
    .toEqual([
      ['must-not-executable', 'reach', 'declaratory', reach, false],
      ['must-not-review', 'reach', 'declaratory', reach, false],
    ]);
});

it('review-only strings remain separate by declaration slot and occupied position', () => {
  const review: ProhibitionFact = { ...fact, id: null, mode: 'review-only' };

  const result = prohibitionAssessmentItems('.', [review,
    { ...review, declarationSlot: 1, description: 'Do not persist' },
    { ...review, position: 'other/views' }]);

  expect(result.map((item) => [item.sourceKey, item.status, item.nextStep])).toEqual([
    ['["shop/views",0]', 'review-required', renderAssessmentNextStep('review-prohibition')],
    ['["shop/views",1]', 'review-required', renderAssessmentNextStep('review-prohibition')],
    ['["other/views",0]', 'review-required', renderAssessmentNextStep('review-prohibition')],
  ]);
});

it.each([
  [['passed', 'unverified', 'failed'], 'failed'],
  [['passed', 'unverified'], 'unverified'],
  [['passed', 'passed'], 'passed'],
] as const)('collapses probe measurements %j using source gate priority', (gates, status) => {
  const sources = gates.map((gate) => measured(gate));
  const result = prohibitionAssessmentItems('.', sources);

  expect(result).toHaveLength(1);
  expect(result[0].status).toBe(status);

  expect(result[0].evidence).toEqual({ fact: sources.find((entry) => entry.gate === status),
    measurements: sources });
});

it('keeps distinct warning files once without making warning counts gate failures', () => {
  const warning = { filePath: 'src/shop/views/A.ts', message: 'network', severity: 'warn',
    gate: 'passed', observation: true, affectsExit: false } as const;

  const sources = [measured('passed', { prohibitionFindings: [warning,
    { ...warning, filePath: 'src/shop/views/Z.ts' },
    { ...warning, severity: 'error', filePath: 'src/shop/views/Error.ts' }] }),
  measured('passed', { prohibitionFindings: [warning] }), fact];

  const result = prohibitionAssessmentItems('.', sources);

  expect(result.map((item) => [item.id, item.lane, item.status, item.affectsExit])).toEqual([
    ['must-not-executable', 'gate', 'passed', false],
    ['must-not-match', 'conformance', 'failed', false],
    ['must-not-match', 'conformance', 'failed', false],
  ]);

  expect(result.slice(1).map((item) => item.evidence)).toEqual([
    warning, { ...warning, filePath: 'src/shop/views/Z.ts' },
  ]);

  expect(result[1].sourceKey).not.toBe(result[2].sourceKey);
});

it('uses passed measurement ahead of the original unverified plan', () => {
  const source = measured('passed');
  const result = prohibitionAssessmentItems('.', [fact, source]);

  expect(result).toHaveLength(1);

  expect(result[0]).toMatchObject({ status: 'passed', affectsExit: false,
    evidence: { fact: source, measurements: [fact, source] } });
});
