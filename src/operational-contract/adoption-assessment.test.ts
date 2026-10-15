import { describe, expect, it } from 'vitest';
import type { AdoptionAssessment, AssessmentHeadline } from '../config';
import { renderAssessment, renderAssessmentText, renderAssessmentOutput,
  renderAssessmentConflict, renderMissingDoctorIdentity, renderAssessmentGuidance,
  renderAssessmentHeadline } from './adoption-assessment';

const headlines: [AssessmentHeadline, string][] = [
  ['blocked', 'Adoption blocked: executable gates failed.'],
  ['evidence-unverified', 'Adoption unverified: required evidence is incomplete or unavailable.'],
  ['executable-unverified', 'Adoption unverified: required executable evidence could not run.'],
  ['source-unverified', 'Adoption unverified: required source-universe evidence is '
  + 'incomplete or unavailable.'],
  ['review-required', 'Gates passed; semantic review remains required.'],
  ['declaratory', 'Gates passed for current source; declared positions remain unexercised.'],
  ['none-known', 'Gates passed; Blueprint found no known review item in this '
  + 'scope. This is not proof of product correctness.'],
];

describe('assessment rendering', () => {
  it.each(headlines)('renders the source-selected %s headline exactly', (key, expected) => {
    expect(renderAssessmentHeadline(key)).toBe(expected);
  });

  it('retains separate lanes, full source evidence, stable identity and next steps', () => {
    const assessment: AdoptionAssessment = {
      scope: 'current-config-adoption', headline: 'source-unverified',
      gates: { status: 'passed', failed: 0, unverified: 0 },
      conformance: { freshViolations: 1, baselinedDebt: 2, nonBlockingObservations: 3 },
      reach: { covered: 4, partial: 5, declaratory: 6 },
      review: { status: 'required', required: 7, recorded: 8 },
      items: [{
        id: 'outside', application: 'apps/web', subject: 'source universe',
        sourceKey: 'outside:full',
        lane: 'reach', status: 'unverified', claim: 'required evidence',
        source: 'outsideScopeEvidence',
        evidence: { status: 'unavailable', reason: 'permission' }, reach: 'partial',
        limitations: ['inventory unavailable'], signals: ['review scope'], affectsExit: false,
        nextStep: 'restore access',
      }], limitations: ['bounded static analysis'],
    };

    expect(renderAssessment(assessment)).toEqual([
      'Assessment scope: current-config-adoption',
      'Executable gates: passed (0 failed, 0 unverified)',
      'Structural evidence: 1 fresh violation(s), 2 baselined debt '
      + 'item(s), 3 non-blocking observation(s)',
      'Reach: 4 covered, 5 partial, 6 declaratory',
      'Semantic review: required (7 required, 8 recorded)',
      'Adoption unverified: required source-universe evidence is incomplete or unavailable.',
      'This report does not prove product ownership or topology '
      + 'correctness. Conformance counts overlap; do not sum them.',
      '[\u005b"current-config-adoption","apps/web","outside",'
      + '"outside:full"\u005d] reach: unverified — source universe: '
      + 'required evidence',
      '  Source: outsideScopeEvidence; reach: partial; affectsExit: false',
      '  Evidence: {"status":"unavailable","reason":"permission"}',
      '  Limitation: inventory unavailable', '  Review signal: review scope',
      '  Next: restore access', 'Limitation: bounded static analysis',
    ]);

    expect(renderAssessmentText(assessment)).toBe(renderAssessment(assessment).join('\n'));

    expect(renderAssessmentOutput(assessment, 'Additional source detail')).toBe(
      `${renderAssessmentText(assessment)}\nAdditional source detail`,
    );

    assessment.items[0]!.nextStep = null;
    expect(renderAssessment(assessment).filter((line) => line.startsWith('  Next:'))).toEqual([]);

    assessment.items[0]!.evidence = {
      files: ['first.ts', 'second.ts'], empty: [], nullable: null,
      nested: [{ count: 3, values: [false, true] }, { count: 9 }],
    };

    const before = structuredClone(assessment.items[0]!.evidence);

    expect(renderAssessment(assessment).filter((line) => line.startsWith('  Evidence:'))).toEqual([
      '  Evidence: {"files":{"count":2,"example":"first.ts"},'
      + '"empty":{"count":0},"nullable":null,"nested":{"count":2,'
      + '"example":{"count":3,"values":{"count":2,"example":false}}}}',
    ]);

    expect(assessment.items[0]!.evidence).toEqual(before);
  });

  it.each(['assessment', 'gateVerdict', 'deprecated 4.2 alias', 'exit 0', 'baselined debt',
    'root responsibility', 'presentation responsibility', 'runway', 'historical transformation',
    'no live assessment', 'consumer counts'])('static guidance retains %s boundary', (claim) => {
    expect(renderAssessmentGuidance()).toContain(claim);
  });
});

it('identifies invalid source evidence without inferring a diagnosis', () => {
  expect(renderAssessmentConflict('identity-1')).toBe('Conflicting assessment facts: identity-1');
  expect(renderMissingDoctorIdentity()).toBe('Doctor check lacks a source-owned stable identity.');
});
