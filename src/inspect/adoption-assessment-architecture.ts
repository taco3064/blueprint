import type { AssessmentItem, Blueprint } from '../config';
import type { ArchitectureFacts } from './facts';
import type { Finding } from './types';
import type { ProhibitionFact } from './prohibitions';
import type { ProhibitionEvidence } from './prohibition-wiring';
import { findingAssessmentItems } from './assessment-findings';
import { reachAssessmentItems } from './assessment-reach';
import { prohibitionAssessmentItems } from './assessment-prohibitions';
import { moduleAssessmentItems } from './assessment-modules';
import { responsibilityItems } from './assessment-responsibility';

export function architectureAssessmentItems(input: {
  application: string;
  blueprint: Blueprint;
  facts: ArchitectureFacts;
  findings: Finding[];
  suppressed?: Finding[];
  prohibitions?: (ProhibitionFact | ProhibitionEvidence)[];
}): AssessmentItem[] {
  const { application, blueprint, facts, findings, suppressed = [], prohibitions = [] } = input;

  return [
    ...findingAssessmentItems(application, findings, suppressed),
    ...reachAssessmentItems(application, facts, facts.coverage),
    ...prohibitionAssessmentItems(application, [...facts.prohibitions, ...prohibitions]),
    ...moduleAssessmentItems(application, facts, [...findings, ...suppressed]),
    ...responsibilityItems(application, blueprint, facts),
  ].map((item, declarationOrder) => ({ ...item, declarationOrder }));
}
