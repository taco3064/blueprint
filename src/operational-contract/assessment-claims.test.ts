import { expect, it } from 'vitest';
import { renderAssessmentClaim, renderAssessmentNextStep } from './assessment-claims';

it.each([
  ['baseline-evidence', 'baseline debt evidence'],
  ['outside-source-universe', 'outside the governed root'],
  ['architecture-coverage', 'reach the current governed source'],
  ['import-analysis', 'Static import analysis'],
  ['module-dependencies', 'observed direct imports'],
  ['module-dependency-reach', 'reached this module'],
  ['inspect-finding', 'structural rule'],
  ['inspect-gate', 'executable gate policy'],
  ['must-not-review', 'semantic review'],
  ['must-not-executable', 'bounded detector'],
  ['must-not-match', 'bounded prohibition'],
  ['layer-responsibility', 'layer responsibility'],
  ['module-runway', 'no current module'],
  ['module-root-responsibility', 'module root responsibility'],
  ['module-ownership', 'module ownership'],
  ['transformation-obligation', 'Bounded verification'],
  ['transformation-decision', 'placement decision'],
  ['lifecycle-semantic-operation', 'semantic operation'],
  ['lifecycle-deterministic-migration', 'deterministic migration'],
  ['lifecycle-current-config-gates', 'Current-config executable gates'],
])('renders the bounded %s claim', (id, subject) => {
  expect(renderAssessmentClaim(id)).toContain(subject);
});

it.each(['future-evidence',
  'toString'])('retains unrecognized source identifier %s without asserting '
    + 'success', (id) => {
  expect(renderAssessmentClaim(id)).toBe(`Source-owned evidence for ${id}.`);
});

it.each([
  ['repair-baseline', 'Review the current findings and regenerate'],
  ['review-prohibition', 'Review the declared prohibition'],
  ['review-responsibility', 'Review the stated responsibility and ownership'],
  ['verify-transformation-decisions', 'resolve the reported obligation failures'],
  ['complete-lifecycle-operation', 'Follow the pending upgrade playbook'],
] as const)('renders actionable %s guidance', (key, action) => {
  expect(renderAssessmentNextStep(key)).toContain(action);
});
