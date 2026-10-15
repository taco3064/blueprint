import type { AssessmentItem } from '../config';
import { assessmentItem } from './assessment-item';
import { findingIdentity } from './types';
import type { Finding } from './types';

export function findingAssessmentItems(application: string, findings: Finding[],
  suppressed: Finding[]): AssessmentItem[] {
  return [...findings.map((finding) => ({ finding, debt: false })),
    ...suppressed.map((finding) => ({ finding, debt: true }))]
    .flatMap(({ finding, debt }): AssessmentItem[] => {
      const unverified = finding.rule === 'module-dependency-unverified';

      const item = assessmentItem(application, {
        id: 'inspect-finding', sourceKey: findingIdentity(finding), subject: finding.path,
        lane: finding.severity === 'info' || unverified ? 'reach' : 'conformance',
        status: unverified
          ? 'unverified'
          : finding.severity === 'info'
            ? 'not-applicable'
            : debt ? 'known-debt' : 'failed',
        source: 'inspect.finding', evidence: finding,
        affectsExit: !debt && finding.severity === 'error',
        reach: unverified ? 'partial' : null,
      });

      return item.affectsExit
        ? [item, { ...item, id: 'inspect-gate', lane: 'gate', status: unverified
            ? 'unverified'
            : 'failed' }]
        : [item];
    });
}
