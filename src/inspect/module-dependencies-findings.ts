import {
  renderModuleDependencyMissing, renderModuleDependencyUnused, renderModuleDependencyUnverified,
} from '../operational-contract';
import type { ModuleDependencies } from './module-dependencies-types';
import type { Finding } from './types';

export function moduleDependencyFindings(
  result: ModuleDependencies | null, tier: string | undefined,
): Finding[] {
  if (!result || (tier !== 'error' && tier !== 'warn')) {
    return [];
  }

  return result.modules.flatMap((row) => {
    const common: Pick<Finding, 'severity' | 'path'> = { severity: tier, path: row.root };

    const findings: Finding[] = row.observedDirect
      .filter((edge) => row.missingDeclarations.includes(edge.to))
      .map((edge) => ({
        ...common, rule: 'module-dependency-missing', subject: edge.to,
        message: renderModuleDependencyMissing(row, edge),
      }));

    findings.push(...row.unusedDeclarations.map((target) => ({
      ...common, rule: 'module-dependency-unused', subject: target,
      message: renderModuleDependencyUnused(row, target),
    })));

    if (row.uncertainty.length) {
      findings.push({
        ...common, rule: 'module-dependency-unverified', subject: 'analysis',
        message: renderModuleDependencyUnverified(row),
      });
    }

    return findings;
  });
}
