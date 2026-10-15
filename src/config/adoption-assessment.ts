export type AssessmentScope
  = 'current-config-adoption' | 'topology-transformation' | 'lifecycle-upgrade';
export type AssessmentLane = 'gate' | 'conformance' | 'reach' | 'review';
export type AssessmentItemStatus
  = 'passed' | 'failed' | 'unverified' | 'known-debt' | 'review-required'
    | 'review-recorded' | 'declaratory' | 'not-applicable';
export type AssessmentHeadline
  = 'blocked' | 'evidence-unverified' | 'executable-unverified' | 'source-unverified'
    | 'review-required' | 'declaratory' | 'none-known';

/** A bounded claim indexed by its owning source identity. */
export interface AssessmentItem<E = unknown> {
  id: string;
  application: string;
  subject: string;
  sourceKey: string;
  lane: AssessmentLane;
  status: AssessmentItemStatus;
  claim: string;
  source: string;
  evidence: E;
  reach: 'covered' | 'partial' | 'vacuous' | 'runway' | 'unmeasured' | null;
  limitations: string[];
  signals: string[];
  affectsExit: boolean;
  nextStep: string | null;
  declarationOrder?: number;
}

/** Independent evidence lanes; none establishes semantic correctness. */
export interface AdoptionAssessment {
  scope: AssessmentScope;
  headline: AssessmentHeadline;
  gates: { status: 'passed' | 'failed' | 'unverified'; failed: number; unverified: number };
  conformance: { freshViolations: number; baselinedDebt: number; nonBlockingObservations: number };
  reach: { covered: number; partial: number; declaratory: number };
  review: { status: 'required' | 'none-known'; required: number; recorded: number };
  items: AssessmentItem[];
  limitations: string[];
}
