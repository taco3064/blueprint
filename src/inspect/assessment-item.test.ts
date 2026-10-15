import { expect, it } from 'vitest';
import { renderAssessmentClaim } from '../operational-contract';
import { assessmentItem } from './assessment-item';

const input = {
  id: 'architecture-coverage', sourceKey: 'coverage', subject: 'src',
  lane: 'reach', status: 'passed', source: 'inspect.coverage', evidence: { files: 3 },
} as const;

it('supplies nonblocking defaults without erasing the source claim', () => {
  expect(assessmentItem('apps/web', input)).toEqual({
    ...input, application: 'apps/web', claim: renderAssessmentClaim(input.id),
    reach: null, limitations: [], signals: [], affectsExit: false, nextStep: null,
  });
});

it('preserves each explicit source override including empty claims and false exit policy', () => {
  const override = { ...input, application: 'apps/other', claim: '', reach: 'partial' as const,
    limitations: ['bounded'], signals: ['review'], affectsExit: true, nextStep: 'review' };

  expect(assessmentItem('apps/web', override)).toEqual(override);
});
