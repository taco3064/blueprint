import type { AssessmentItem } from '../config';
import type { ArchitectureFacts } from './facts';
import type { Finding } from './types';
import { findingIdentity } from './types';
import { assessmentItem } from './assessment-item';

export function moduleAssessmentItems(application: string, facts: ArchitectureFacts,
  existing: Finding[]): AssessmentItem[] {
  const graph = facts.moduleDependencies;

  if (!graph) {
    return [];
  }

  const items: AssessmentItem[] = [assessmentItem(application, {
    id: 'module-dependencies', sourceKey: 'module-dependencies', subject: facts.resolved.sourceRoot,
    lane: 'reach', source: 'inspect.moduleDependencies', evidence: graph,
    status: graph.status === 'runway'
      ? 'declaratory'
      : graph.status === 'indeterminate'
        ? 'unverified'
        : 'passed',
    reach: graph.status === 'runway'
      ? 'runway'
      : graph.status === 'indeterminate'
        ? 'partial'
        : 'covered',
    limitations: ['direct-graph-agreement-does-not-prove-ownership'],
  })];

  const identities = new Set(existing.map(findingIdentity));

  for (const row of graph.modules) {
    for (const [kind, targets] of [['missing', row.missingDeclarations], ['unused',
      row.unusedDeclarations]] as const) {
      for (const target of targets) {
        const finding = { rule: `module-dependency-${kind}`, path: row.root, subject: target };
        const key = findingIdentity(finding);

        if (!identities.has(key)) {
          items.push(assessmentItem(application, {
            id: 'inspect-finding', sourceKey: key, subject: row.root,
            lane: 'conformance', status: 'failed', source: 'inspect.finding',
            evidence: { ...finding, row },
          }));
        }
      }
    }

    if (row.reach === 'vacuous') {
      items.push(assessmentItem(application, {
        id: 'module-dependency-reach', sourceKey: row.root, subject: row.root,
        lane: 'reach', status: 'declaratory', source: 'inspect.moduleDependencies',
        evidence: row, reach: 'vacuous',
      }));
    }
  }

  return items;
}
