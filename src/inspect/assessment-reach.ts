import type { AssessmentItem } from '../config';
import type { ArchitectureFacts } from './facts';
import type { Coverage } from './coverage';
import { assessmentItem } from './assessment-item';

export function reachAssessmentItems(application: string, facts: ArchitectureFacts,
  coverage: Coverage): AssessmentItem[] {
  const items: AssessmentItem[] = [];

  if (facts.demand === 'application-scope') {
    items.push(outsideItem(application, facts));
  }

  const missed = coverage.outsideNets.length > 0 || (coverage.sourceFiles > 0
    && coverage.layerFiles === 0);

  items.push(assessmentItem(application, {
    id: 'architecture-coverage', sourceKey: 'architecture-coverage',
    subject: facts.resolved.sourceRoot,
    lane: 'reach', source: 'inspect.coverage', evidence: coverage,
    status: missed ? 'unverified' : coverage.sourceFiles ? 'passed' : 'declaratory',
    reach: missed
      ? 'partial'
      : coverage.sourceFiles
        ? 'covered'
        : facts.resolved.moduleRunway
          ? 'runway'
          : 'vacuous',
  }));

  const incomplete = facts.analysis.status !== 'healthy'
    || facts.analysis.unknownDynamicImports > 0;

  items.push(assessmentItem(application, {
    id: 'import-analysis', sourceKey: 'import-analysis', subject: facts.resolved.sourceRoot,
    lane: 'reach', source: 'inspect.importAnalysis', evidence: facts.analysis,
    status: incomplete ? 'unverified' : 'passed', reach: incomplete ? 'partial' : 'covered',
  }));

  return items;
}

function outsideItem(application: string, facts: ArchitectureFacts): AssessmentItem {
  const outside = facts.outsideScope;

  const status = outside.status === 'complete'
    ? 'passed'
    : outside.status === 'not-applicable' ? 'not-applicable' : 'unverified';

  return assessmentItem(application, {
    id: 'outside-source-universe', sourceKey: 'outside-source-universe',
    subject: facts.resolved.sourceRoot,
    lane: 'reach', status, source: 'inspect.outsideScope', evidence: outside,
    reach: status === 'passed' ? 'covered' : status === 'not-applicable' ? null : 'partial',
    limitations: 'limitations' in outside
      ? outside.limitations
      : outside.status === 'unavailable'
        ? [outside.reason]
        : outside.status === 'not-requested' ? ['internal-evidence-demand-invariant-defect'] : [],
  });
}
