import { renderAssessmentNextStep } from '../operational-contract';
import type { AssessmentItem } from '../config';
import type { ProhibitionFact } from './prohibitions';
import type { ProhibitionEvidence } from './prohibition-wiring';
import { assessmentItem } from './assessment-item';

export function prohibitionAssessmentItems(application: string,
  facts: (ProhibitionFact | ProhibitionEvidence)[]): AssessmentItem[] {
  const grouped = new Map<string, (ProhibitionFact | ProhibitionEvidence)[]>();

  for (const fact of facts) {
    const key = JSON.stringify([fact.position, fact.id ?? fact.declarationSlot]);

    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }

  return [...grouped.values()].flatMap((group): AssessmentItem[] => {
    const fact = representative(group);

    const sourceKey = JSON.stringify([fact.position, fact.id ?? fact.declarationSlot]);
    const declaratory = fact.reach === 'vacuous' || fact.reach === 'runway';
    const review = fact.mode === 'review-only';
    const measured = isMeasured(fact);

    const item = assessmentItem(application, {
      id: review ? 'must-not-review' : 'must-not-executable',
      sourceKey,
      subject: fact.position, source: 'inspect.prohibition', evidence: { fact,
        measurements: group },
      lane: declaratory ? 'reach' : review ? 'review' : 'gate',
      status: declaratory
        ? 'declaratory'
        : review
          ? 'review-required'
          : measured ? fact.gate : 'unverified',
      reach: fact.reach, limitations: fact.limitations,
      affectsExit: !declaratory && measured && fact.affectsExit,
      nextStep: review ? renderAssessmentNextStep('review-prohibition') : null,
    });

    return [item, ...warningItems(application, { sourceKey, position: fact.position }, group)];
  });
}

function warningItems(application: string, context: { sourceKey: string; position: string },
  group: (ProhibitionFact | ProhibitionEvidence)[]): AssessmentItem[] {
  const { sourceKey, position } = context;

  const findings = group.flatMap((entry) => isMeasured(entry)
    ? entry.prohibitionFindings ?? []
    : []);

  const warning = [...new Map(findings.filter((finding) => finding.severity === 'warn')
    .map((finding) => [finding.filePath, finding])).values()];

  return warning.map((finding) => assessmentItem(application, {
    id: 'must-not-match', sourceKey: JSON.stringify([sourceKey, finding.filePath]),
    subject: position, source: 'lint.must-not', evidence: finding,
    lane: 'conformance', status: 'failed',
  }));
}

function isMeasured(fact: ProhibitionFact | ProhibitionEvidence): fact is ProhibitionEvidence {
  return 'gate' in fact;
}

function representative(group: (ProhibitionFact | ProhibitionEvidence)[]) {
  return group.find((entry) => isMeasured(entry) && entry.gate === 'failed')
    ?? group.find((entry) => isMeasured(entry) && entry.gate === 'unverified')
    ?? group.find(isMeasured) ?? group[0]!;
}
