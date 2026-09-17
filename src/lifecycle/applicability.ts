import type { ApplicationFacts, UpgradeApplicability } from './types';
import { compareVersions } from './version';

export interface ApplicableScope {
  applications: string[];
  evidence: Record<string, string[]>;
}

export function applicableScope(
  applicability: UpgradeApplicability,
  facts: readonly ApplicationFacts[],
  source: string,
): ApplicableScope {
  const roots = facts.map((fact) => fact.root);

  if (applicability.kind === 'always') {
    return { applications: roots, evidence: {} };
  }

  if (applicability.kind === 'source-below') {
    return {
      applications: compareVersions(source, applicability.version) < 0 ? roots : [],
      evidence: {},
    };
  }

  if (applicability.kind === 'legacy-config-shape') {
    return {
      applications: facts.filter((fact) => fact.legacyShape).map((fact) => fact.root),
      evidence: {},
    };
  }

  const key = applicability.key;
  const matching = facts.filter((fact) => Object.hasOwn(fact.legacyKeys, key));

  return {
    applications: matching.map((fact) => fact.root),
    evidence: Object.fromEntries(matching.map((fact) => [fact.root, fact.legacyKeys[key]])),
  };
}
