import { describe, expect, it } from 'vitest';
import type { AssessmentItem } from '../config';
import { assessmentItem } from './assessment-item';
import { assessmentIdentity, deriveAdoptionAssessment } from './adoption-assessment';

const item = (change: Partial<AssessmentItem> = {}) => assessmentItem('.', {
  id: 'test', sourceKey: 'source', subject: 'src/a', source: 'fixture', evidence: {},
  lane: 'gate', status: 'passed', ...change,
});

const assess = (items: AssessmentItem[]) => deriveAdoptionAssessment('current-config-adoption',
  items);

describe('assessment independent lanes', () => {
  it.each([
    ['blocked', 'failed', true, true, true],
    ['evidence-unverified', 'unverified', true, true, true],
    ['executable-unverified', 'unverified', false, true, true],
    ['source-unverified', 'passed', true, false, false],
    ['review-required', 'passed', false, true, true],
    ['declaratory', 'passed', false, false, true],
    ['none-known', 'passed', false, false, false],
  ] as const)('selects %s without collapsing independent lanes', (...args) => {
    const [headline, gate, source, review, declaration] = args;
    const items = [item({ status: gate })];

    if (source) {
      items.push(item({ id: 'source', lane: 'reach', status: 'unverified', reach: 'partial' }));
    }

    if (review) {
      items.push(item({ id: 'review', lane: 'review', status: 'review-required' }));
    }

    if (declaration) {
      items.push(item({ id: 'declaration', lane: 'reach', status: 'declaratory',
        reach: 'runway' }));
    }

    const result = assess(items);

    expect(result.headline).toBe(headline);
    expect(result.gates.status).toBe(gate);
    expect(result.review.required).toBe(Number(review));
    expect(result.reach.partial).toBe(Number(source));
  });

  it('keeps overlapping counters independent and deduplicates facts',
    () => {
      const warning = item({ lane: 'conformance', status: 'failed' });

      const result = assess([warning, warning,
        item({ id: 'debt', lane: 'conformance', status: 'known-debt' }),
        item({ id: 'error', lane: 'conformance', status: 'failed', affectsExit: true }),
        item({ id: 'record', lane: 'review', status: 'review-recorded' }),
        item({ id: 'reach', lane: 'reach', reach: 'covered', limitations: ['bounded'] }),
        item({ id: 'unknown', lane: 'reach', reach: 'unmeasured', limitations: ['bounded',
          'unknown'] }),
      ]);

      expect(result.gates).toEqual({ status: 'passed', failed: 0, unverified: 0 });

      expect(result.conformance).toEqual({ freshViolations: 2, baselinedDebt: 1,
        nonBlockingObservations: 1 });

      expect(result.review).toEqual({ status: 'none-known', required: 0, recorded: 1 });
      expect(result.reach).toEqual({ covered: 1, partial: 1, declaratory: 0 });
      expect(result.limitations).toEqual(['bounded', 'unknown']);
      expect(result.items).toHaveLength(6);
    });

  it('preserves canonical identity and rejects conflicting facts',
    () => {
      const original = item();
      const changed = item({ subject: 'new label', status: 'failed' });

      expect(assessmentIdentity('current-config-adoption',
        original)).toBe(assessmentIdentity('current-config-adoption', changed));

      expect(() => assess([original, changed])).toThrow('Conflicting assessment facts');

      expect(assess([original, item({ application: 'apps/web' }),
        item({ sourceKey: 'second-importer' })]).items).toHaveLength(3);

      expect(assessmentIdentity('lifecycle-upgrade',
        original)).not.toBe(assessmentIdentity('current-config-adoption', original));
    });

  it('keeps absent and non-applicable evidence distinct from incomplete evidence', () => {
    expect(assess([]).headline).toBe('none-known');

    expect(assess([item({ lane: 'reach',
      status: 'not-applicable' })]).reach).toEqual({ covered: 0, partial: 0, declaratory: 0 });

    expect(assess([item({ lane: 'reach', status: 'not-applicable' })]).headline).toBe('none-known');
  });
});

it('orders lanes then declaration order then subject id and canonical key', () => {
  const entries = [
    item({ id: 'reach', lane: 'reach', subject: 'a' }),
    item({ id: 'review', lane: 'review', subject: 'a' }),
    item({ id: 'conformance', lane: 'conformance', subject: 'a' }),
    item({ id: 'late', declarationOrder: 2, subject: 'a' }),
    item({ id: 'z', subject: 'b' }),
    item({ id: 'a', subject: 'a', sourceKey: 'z' }),
    item({ id: 'a', subject: 'a', sourceKey: 'a', declarationOrder: 0 }),
    item({ id: 'b', subject: 'a' }),
    item({ id: 'early', declarationOrder: 1, subject: 'z' }),
  ];

  expect(assess(entries).items.map((entry) => [entry.id, entry.sourceKey])).toEqual([
    ['a', 'a'], ['a', 'z'], ['b', 'source'], ['z', 'source'], ['early', 'source'],
    ['late', 'source'], ['conformance', 'source'], ['reach', 'source'], ['review', 'source'],
  ]);
});

it('counts gate failures and unverifiable checks independently while ignoring other lane failures',
  () => {
    const result = assess([
      item({ id: 'failed-1', status: 'failed' }),
      item({ id: 'failed-2', status: 'failed' }),
      item({ id: 'unknown', status: 'unverified' }),
      item({ id: 'reach', lane: 'reach', status: 'failed', reach: 'covered' }),
      item({ id: 'conformance', lane: 'conformance', status: 'unverified' }),
    ]);

    expect(result.gates).toEqual({ status: 'failed', failed: 2, unverified: 1 });

    expect(result.conformance).toEqual({ freshViolations: 0, baselinedDebt: 0,
      nonBlockingObservations: 0 });

    expect(result.reach).toEqual({ covered: 1, partial: 0, declaratory: 0 });
    expect(result.headline).toBe('blocked');
  });

it('source unverified status is not invented from a non-reach item or an aggregate partial count',
  () => {
    const result = assess([
      item({ lane: 'conformance', status: 'unverified', reach: 'covered' }),
      item({ id: 'partial', lane: 'reach', status: 'passed', reach: 'partial' }),
      item({ id: 'not-reach', lane: 'review', status: 'not-applicable', reach: 'unmeasured' }),
    ]);

    expect(result.headline).toBe('none-known');
    expect(result.reach).toEqual({ covered: 0, partial: 1, declaratory: 0 });
  });

it.each([false, true])('counts only nonblocking conformance failures with affectsExit=%s',
  (affectsExit) => {
    const result = assess([
      item({ id: 'gate', lane: 'gate', status: 'failed', affectsExit: false }),
      item({ id: 'finding', lane: 'conformance', status: 'failed', affectsExit }),
    ]);

    expect(result.conformance).toEqual({ freshViolations: 1, baselinedDebt: 0,
      nonBlockingObservations: affectsExit ? 0 : 1 });

    expect(result.gates).toEqual({ status: 'failed', failed: 1, unverified: 0 });
  });

it('counts known debt only in the conformance lane', () => {
  const result = assess([
    item({ id: 'gate-debt', lane: 'gate', status: 'known-debt' }),
    item({ id: 'reach-debt', lane: 'reach', status: 'known-debt' }),
    item({ id: 'review-debt', lane: 'review', status: 'known-debt' }),
    item({ id: 'structural-debt', lane: 'conformance', status: 'known-debt' }),
    item({ id: 'fresh', lane: 'conformance', status: 'failed', affectsExit: true }),
  ]);

  expect(result.conformance).toEqual({
    freshViolations: 1, baselinedDebt: 1, nonBlockingObservations: 0,
  });
});
