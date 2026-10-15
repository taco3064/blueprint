import type { AdoptionAssessment, AssessmentHeadline } from '../config';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

const HEADLINES: Record<AssessmentHeadline, string> = {
  blocked: 'Adoption blocked: executable gates failed.',
  'evidence-unverified': 'Adoption unverified: required evidence is incomplete or unavailable.',
  'executable-unverified': 'Adoption unverified: required executable evidence could not run.',
  'source-unverified': 'Adoption unverified: required source-universe evidence is '
    + 'incomplete or unavailable.',
  'review-required': 'Gates passed; semantic review remains required.',
  declaratory: 'Gates passed for current source; declared positions remain unexercised.',
  'none-known': 'Gates passed; Blueprint found no known review item in this '
    + 'scope. This is not proof of product correctness.',
};

export function renderAssessmentHeadline(headline: AssessmentHeadline): OperationalText {
  return operationalText(HEADLINES[headline]);
}

export function renderAssessment(assessment: AdoptionAssessment): OperationalText[] {
  const { gates, conformance, reach, review } = assessment;

  return [
    `Assessment scope: ${assessment.scope}`,
    `Executable gates: ${gates.status} (${gates.failed} failed, ${gates.unverified} unverified)`,
    `Structural evidence: ${conformance.freshViolations} fresh violation(s), ${conformance.baselinedDebt} baselined debt item(s), ${conformance.nonBlockingObservations} non-blocking observation(s)`,
    `Reach: ${reach.covered} covered, ${reach.partial} partial, ${reach.declaratory} declaratory`,
    `Semantic review: ${review.status} (${review.required} required, ${review.recorded} recorded)`,
    renderAssessmentHeadline(assessment.headline),
    'This report does not prove product ownership or topology '
    + 'correctness. Conformance counts overlap; do not sum them.',
    ...assessment.items.flatMap((item) => [
      `[${JSON.stringify([assessment.scope, item.application, item.id, item.sourceKey])}] ${item.lane}: ${item.status} — ${item.subject}: ${item.claim}`,
      `  Source: ${item.source}; reach: ${item.reach}; affectsExit: ${item.affectsExit}`,
      `  Evidence: ${JSON.stringify(summarizeEvidence(item.evidence))}`,
      ...item.limitations.map((value) => `  Limitation: ${value}`),
      ...item.signals.map((value) => `  Review signal: ${value}`),
      ...(item.nextStep === null ? [] : [`  Next: ${item.nextStep}`]),
    ]),
    ...assessment.limitations.map((value) => `Limitation: ${value}`),
  ].map((line) => operationalText(line));
}

export function renderAssessmentGuidance(): string {
  return 'Run `blueprint doctor --json` for the current-config adoption assessment; '
    + '`blueprint inspect --json` supplies the architecture subset. Report executable gates, '
    + 'structural evidence (including baselined debt and non-blocking violations), reach, and '
    + 'semantic review separately. Green checks do not prove module ownership, layer placement, '
    + 'root responsibility, presentation responsibility, or topology correctness. '
    + 'Read `assessment`; `gateVerdict` is gate-only and `verdict` is its deprecated 4.2 alias. '
    + '`ok` retains exit compatibility, so exit 0 does not mean all evidence was verified. '
    + 'Review module/layer/root responsibility explicitly; consumer counts are review signals, '
    + 'not proof of neutral ownership. A deliberate empty-module runway is declaratory. '
    + 'Current-config gates cannot discharge historical transformation or lifecycle obligations. '
    + 'These generated instructions contain no live assessment; rerun '
    + 'the commands against current source.';
}

export function renderAssessmentText(assessment: AdoptionAssessment): OperationalText {
  return operationalText(renderAssessment(assessment));
}

export function renderAssessmentConflict(key: string): OperationalText {
  return operationalText(`Conflicting assessment facts: ${key}`);
}

export function renderMissingDoctorIdentity(): OperationalText {
  return operationalText('Doctor check lacks a source-owned stable identity.');
}

function summarizeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length === 0
      ? { count: 0 }
      : { count: value.length, example: summarizeEvidence(value[0]) };
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
      summarizeEvidence(entry)]));
  }

  return value;
}

export function renderAssessmentOutput(assessment: AdoptionAssessment,
  detail: string): OperationalText {
  return operationalText([...renderAssessment(assessment), detail]);
}
