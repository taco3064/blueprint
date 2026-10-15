import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

const CLAIMS: Record<string, string> = {
  'baseline-evidence': 'Recorded baseline debt evidence can be read.',
  'outside-source-universe': 'Required source outside the governed root was inventoried.',
  'architecture-coverage': 'Architecture rules reach the current governed source.',
  'import-analysis': 'Static import analysis produced usable evidence for the governed source.',
  'module-dependencies': 'Governed module graph measurement completed for observed direct imports.',
  'module-dependency-reach': 'Module dependency analysis reached this module.',
  'inspect-finding': 'Current source conforms to the reported structural rule.',
  'inspect-gate': 'Structural findings satisfy the existing executable gate policy.',
  'must-not-review': 'The declared prohibition requires semantic review.',
  'must-not-executable': 'The bounded detector evaluated the declared prohibition.',
  'must-not-match': 'Current source satisfies the bounded prohibition.',
  'layer-responsibility': 'The declared layer responsibility requires review against '
    + 'current source.',
  'module-runway': 'The declared module-first runway has no current module to evaluate.',
  'module-root-responsibility': 'The module root responsibility requires review against current '
    + 'source.',
  'module-ownership': 'The declared module ownership requires semantic review.',
  'transformation-obligation': 'Bounded verification of the retained transformation obligation.',
  'transformation-decision': 'Recorded placement decision within the transformation workflow.',
  'lifecycle-semantic-operation': 'Completion record for the required lifecycle '
    + 'semantic operation.',
  'lifecycle-deterministic-migration': 'Completion record for the lifecycle '
    + 'deterministic migration.',
  'lifecycle-current-config-gates': 'Current-config executable gates for this application.',
};

const NEXT_STEPS = {
  'repair-baseline': 'Review the current findings and regenerate the baseline with '
    + '`blueprint inspect --update-baseline`.',
  'review-prohibition': 'Review the declared prohibition against the source and record '
    + 'the decision in the owning review workflow.',
  'review-responsibility': 'Review the stated responsibility and ownership against the '
    + 'source; correct the declaration or placement where they disagree.',
  'verify-transformation-decisions': 'Review the retained transformation decisions and resolve the '
    + 'reported obligation failures before completing the '
    + 'transformation.',
  'complete-lifecycle-operation': 'Follow the pending upgrade playbook, complete the semantic '
    + 'operation, and record it through the lifecycle workflow.',
};

export function renderAssessmentClaim(id: string): OperationalText {
  return operationalText(Object.hasOwn(CLAIMS,
    id)
    ? CLAIMS[id]!
    : `Source-owned evidence for ${id}.`);
}

export function renderAssessmentNextStep(key: keyof typeof NEXT_STEPS): OperationalText {
  return operationalText(NEXT_STEPS[key]);
}
