import { isDeepStrictEqual } from 'node:util';
import { renderAssessmentConflict } from '../operational-contract';
import type { AdoptionAssessment, AssessmentItem, AssessmentScope,
  AssessmentHeadline } from '../config';

export function assessmentIdentity(scope: AssessmentScope, item: AssessmentItem): string {
  return JSON.stringify([scope, item.application, item.id, item.sourceKey]);
}

function orderedItems(scope: AssessmentScope, input: AssessmentItem[]): AssessmentItem[] {
  const byIdentity = new Map<string, AssessmentItem>();

  for (const item of input) {
    const key = assessmentIdentity(scope, item);
    const prior = byIdentity.get(key);

    if (prior && !isDeepStrictEqual(prior, item)) {
      throw new Error(renderAssessmentConflict(key));
    }

    byIdentity.set(key, item);
  }

  const lanes = ['gate', 'conformance', 'reach', 'review'];

  return [...byIdentity.values()].sort((a, b) => lanes.indexOf(a.lane) - lanes.indexOf(b.lane)
    || (a.declarationOrder ?? 0) - (b.declarationOrder ?? 0)
    || a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id)
    || a.sourceKey.localeCompare(b.sourceKey));
}

export function deriveAdoptionAssessment(
  scope: AssessmentScope, input: AssessmentItem[],
): AdoptionAssessment {
  const items = orderedItems(scope, input);
  const count = (predicate: (item: AssessmentItem) => boolean) => items.filter(predicate).length;
  const failed = count((item) => item.lane === 'gate' && item.status === 'failed');
  const unverified = count((item) => item.lane === 'gate' && item.status === 'unverified');
  const required = count((item) => item.status === 'review-required');

  const reach = {
    covered: count((item) => item.lane === 'reach' && item.reach === 'covered'),
    partial: count((item) => item.lane === 'reach' && (item.reach === 'partial'
      || item.reach === 'unmeasured')),
    declaratory: count((item) => item.status === 'declaratory'),
  };

  const sourceUnverified = items.some((item) => item.lane === 'reach'
    && item.status === 'unverified');

  return {
    scope,
    headline: headline({ failed, unverified, sourceUnverified, required,
      declaratory: reach.declaratory }),
    gates: { status: failed ? 'failed' : unverified ? 'unverified' : 'passed', failed, unverified },
    conformance: {
      freshViolations: count((item) => item.lane === 'conformance' && item.status === 'failed'),
      baselinedDebt: count((item) => item.lane === 'conformance' && item.status === 'known-debt'),
      nonBlockingObservations: count((item) => item.lane === 'conformance'
        && item.status === 'failed' && !item.affectsExit),
    },
    reach,
    review: { status: required ? 'required' : 'none-known', required,
      recorded: count((item) => item.status === 'review-recorded') },
    items,
    limitations: [...new Set(items.flatMap((item) => item.limitations))],
  };
}

function headline(facts: { failed: number; unverified: number; sourceUnverified: boolean;
  required: number; declaratory: number; }): AssessmentHeadline {
  if (facts.failed) {
    return 'blocked';
  }

  if (facts.unverified && facts.sourceUnverified) {
    return 'evidence-unverified';
  }

  if (facts.unverified) {
    return 'executable-unverified';
  }

  if (facts.sourceUnverified) {
    return 'source-unverified';
  }

  if (facts.required) {
    return 'review-required';
  }

  return facts.declaratory ? 'declaratory' : 'none-known';
}
