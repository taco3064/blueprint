import { applicableScope } from './applicability';
import type {
  ApplicationFacts,
  PendingOperation,
  UpgradeCatalog,
  UpgradeOperation,
} from './types';
import { compareVersions } from './version';

export interface ResolveUpgradeInput {
  catalog: UpgradeCatalog;
  source: string;
  target: string;
  completed: readonly string[];
  facts: readonly ApplicationFacts[];
}

export interface SuppressedOperation {
  id: string;
  relation: 'cancel' | 'supersede';
  by: string;
}

export type ResolutionProblem
  = | { kind: 'requires-canceled'; id: string; target: string; by: string }
    | { kind: 'dependency-cycle'; ids: string[] };

export interface UpgradePlan {
  status: 'plan';
  migrations: { id: string; applications: string[] }[];
  operations: PendingOperation[];
  suppressed: SuppressedOperation[];
  inapplicable: string[];
}

export type UpgradeResolution
  = | UpgradePlan
    | { status: 'unsupported'; checkpoint: string }
    | { status: 'downgrade' }
    | { status: 'current' }
    | { status: 'invalid'; problems: ResolutionProblem[] };

interface Candidate {
  operation: UpgradeOperation;
  scope: PendingOperation;
}

export function resolveUpgrade(input: ResolveUpgradeInput): UpgradeResolution {
  const { catalog, source, target } = input;

  if (compareVersions(source, catalog.supportedFrom) < 0) {
    return { status: 'unsupported', checkpoint: catalog.supportedFrom };
  }

  const order = compareVersions(source, target);

  if (order !== 0) {
    return order > 0 ? { status: 'downgrade' } : planInterval(input);
  }

  return { status: 'current' };
}

function inInterval(input: ResolveUpgradeInput, version: string): boolean {
  return compareVersions(input.source, version) < 0
    && compareVersions(version, input.target) <= 0;
}

function releaseOrder<T extends { introducedIn: string }>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => compareVersions(left.entry.introducedIn, right.entry.introducedIn)
      || left.index - right.index)
    .map(({ entry }) => entry);
}

function suppressions(
  interval: UpgradeOperation[],
  completed: ReadonlySet<string>,
): Map<string, SuppressedOperation> {
  const inside = new Set(interval.map((operation) => operation.id));
  const suppressed = new Map<string, SuppressedOperation>();

  for (const operation of interval) {
    const relations = [
      ...operation.cancels.map((id) => ({ id, relation: 'cancel' as const })),
      ...operation.supersedes.map((id) => ({ id, relation: 'supersede' as const })),
    ];

    for (const { id, relation } of relations) {
      if (inside.has(id) && !completed.has(id)) {
        suppressed.set(id, { id, relation, by: operation.id });
      }
    }
  }

  return suppressed;
}

function planInterval(input: ResolveUpgradeInput): UpgradeResolution {
  const interval = releaseOrder(input.catalog.operations)
    .filter((operation) => inInterval(input, operation.introducedIn));

  const completed = new Set(input.completed);
  const suppressed = suppressions(interval, completed);

  const candidates = interval
    .filter((operation) => !suppressed.has(operation.id) && !completed.has(operation.id))
    .map((operation): Candidate => ({ operation, scope: scopeOf(input, operation, completed) }));

  const effective = candidates.filter((candidate) => candidate.scope.applications.length);
  const ordered = orderByRequirements(effective, { completed, suppressed });

  if (!Array.isArray(ordered)) {
    return { status: 'invalid', problems: ordered.problems };
  }

  return {
    status: 'plan',
    migrations: releaseOrder(input.catalog.migrations)
      .filter((migration) => inInterval(input, migration.introducedIn))
      .map((migration) => ({
        id: migration.id,
        applications: applicableScope(migration.applicability, input.facts, input.source)
          .applications,
      }))
      .filter((migration) => migration.applications.length),
    operations: ordered.map((candidate) => candidate.scope),
    suppressed: [...suppressed.values()],
    inapplicable: candidates
      .filter((candidate) => !candidate.scope.applications.length)
      .map((candidate) => candidate.operation.id),
  };
}

function scopeOf(
  input: ResolveUpgradeInput,
  operation: UpgradeOperation,
  completed: ReadonlySet<string>,
): PendingOperation {
  const scope = applicableScope(operation.applicability, input.facts, input.source);

  return {
    id: operation.id,
    applications: scope.applications,
    evidence: scope.evidence,
    supersedes: operation.supersedes.map((id) => ({ id, completed: completed.has(id) })),
  };
}

interface RequirementContext {
  completed: ReadonlySet<string>;
  suppressed: ReadonlyMap<string, SuppressedOperation>;
}

function requirementOwner(
  target: string,
  context: RequirementContext,
): { owner: string } | { canceledBy: string } {
  let owner = target;
  let suppression = context.suppressed.get(owner);

  while (suppression?.relation === 'supersede') {
    owner = suppression.by;
    suppression = context.suppressed.get(owner);
  }

  return suppression ? { canceledBy: suppression.by } : { owner };
}

function orderByRequirements(
  effective: Candidate[],
  context: RequirementContext,
): Candidate[] | { problems: ResolutionProblem[] } {
  const ids = new Set(effective.map((candidate) => candidate.operation.id));
  const problems: ResolutionProblem[] = [];
  const edges = new Map(effective.map((candidate) => [candidate.operation.id, new Set<string>()]));

  for (const { operation } of effective) {
    for (const target of operation.requires.filter((id) => !context.completed.has(id))) {
      const resolved = requirementOwner(target, context);

      if ('canceledBy' in resolved) {
        problems.push({
          kind: 'requires-canceled', id: operation.id, target, by: resolved.canceledBy,
        });
      } else if (ids.has(resolved.owner) && resolved.owner !== operation.id) {
        edges.get(operation.id)!.add(resolved.owner);
      }
    }
  }

  return problems.length ? { problems } : topological(effective, edges);
}

function topological(
  effective: Candidate[],
  edges: Map<string, Set<string>>,
): Candidate[] | { problems: ResolutionProblem[] } {
  const ordered: Candidate[] = [];
  const placed = new Set<string>();
  let remaining = effective;

  while (remaining.length) {
    const next = remaining.find((candidate) =>
      [...edges.get(candidate.operation.id)!].every((id) => placed.has(id)));

    if (next === undefined) {
      return {
        problems: [{
          kind: 'dependency-cycle',
          ids: remaining.map((candidate) => candidate.operation.id),
        }],
      };
    }

    ordered.push(next);
    placed.add(next.operation.id);
    remaining = remaining.filter((candidate) => candidate !== next);
  }

  return ordered;
}
