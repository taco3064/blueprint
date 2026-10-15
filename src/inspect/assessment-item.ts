import { renderAssessmentClaim } from '../operational-contract';
import type { AssessmentItem } from '../config';

export function assessmentItem(application: string, input: Pick<AssessmentItem,
  'id' | 'sourceKey' | 'subject' | 'lane' | 'status' | 'source' | 'evidence'
> & Partial<AssessmentItem>,
): AssessmentItem {
  return { application, claim: renderAssessmentClaim(input.id), reach: null, limitations: [],
    signals: [], affectsExit: false, nextStep: null, ...input };
}
