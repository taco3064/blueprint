import path from 'node:path';
import { minimatch } from 'minimatch';
import { prohibitionGateEvidence } from '../config';
import type { ProhibitionEvidence } from './prohibition-wiring';
import type { LiveLintEvidence, ProhibitionLintFinding } from './lint-runtime';

export function observedProhibitions(
  facts: ProhibitionEvidence[],
  live: LiveLintEvidence,
  root: string,
): ProhibitionEvidence[] {
  return facts.map((fact) => {
    const findings = (live.prohibitionFindings ?? [])
      .filter((finding) => belongsTo(fact, finding, root));

    if (!findings.length) {
      return fact;
    }

    const severity = findings.some((finding) => finding.severity === 'error') ? 'error' : 'warn';
    const wiring = fact.lintIntegration === 'reference-only' ? 'unverified' : fact.lintIntegration;

    return { ...fact, prohibitionFindings: findings,
      ...prohibitionGateEvidence({ status: fact.status, severity, violation: true, wiring }) };
  });
}

function belongsTo(
  fact: ProhibitionEvidence,
  finding: ProhibitionLintFinding,
  root: string,
): boolean {
  const relative = path.relative(root,
    path.resolve(root,
      finding.filePath)).split(path.sep).join('/');

  return finding.layer === fact.layer && finding.id === fact.id
    && fact.files.some((glob) => minimatch(relative, glob, { dot: true }))
    && ![...fact.ignores, ...fact.exempt].some((glob) => minimatch(relative, glob, { dot: true }));
}
