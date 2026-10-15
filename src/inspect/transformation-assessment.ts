import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import type { AdoptionAssessment, AssessmentItem } from '../config';
import type { LayerToModuleObligation, TransformationObligationFailure } from '../project';
import { deriveAdoptionAssessment } from './adoption-assessment';
import type { ArchitectureFacts } from './facts';
import { reachAssessmentItems } from './assessment-reach';

export function assessTransformation(
  obligation: LayerToModuleObligation,
  failures: TransformationObligationFailure[],
  facts: ArchitectureFacts,
): AdoptionAssessment {
  const sourceKey = JSON.stringify([obligation.direction, obligation.origin.head,
    obligation.origin.selectedScope]);

  const base = {
    application: obligation.origin.applicationRoot,
    source: 'transformation-obligation',
    reach: null,
    limitations: ['bounded-workflow-record-not-semantic-proof',
      'current-config-gates-not-historical-proof'],
    signals: [],
    affectsExit: true,
    nextStep: null,
  } satisfies Partial<AssessmentItem>;

  const gate: AssessmentItem = {
    ...base, id: 'transformation-obligation', sourceKey, subject: obligation.origin.selectedScope,
    lane: 'gate', status: failures.length ? 'failed' : 'passed',
    claim: renderAssessmentClaim('transformation-obligation'),
    evidence: { obligation, failures, outsideScope: facts.outsideScope,
      analysis: facts.analysis, findings: facts.findings },
  };

  const decisions: AssessmentItem[] = obligation.origin.sources.map((source) => ({
    ...base, id: 'transformation-decision', sourceKey: JSON.stringify([sourceKey, source.unit]),
    subject: source.unit, lane: 'review',
    status: failures.length ? 'review-required' : 'review-recorded',
    claim: renderAssessmentClaim('transformation-decision'),
    nextStep: failures.length ? renderAssessmentNextStep('verify-transformation-decisions') : null,
    evidence: { origin: obligation.origin, source,
      decisions: obligation.target.decisions.filter((decision) => decision.source === source.unit),
      failures },
  }));

  return deriveAdoptionAssessment('topology-transformation', [gate, ...decisions,
    ...reachAssessmentItems(obligation.origin.applicationRoot, facts, facts.coverage)]);
}
