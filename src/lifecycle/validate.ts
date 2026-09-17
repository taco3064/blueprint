import { LEGACY_CONFIG_KEYS } from './catalog';
import { resolveUpgrade } from './resolve';
import type { ResolutionProblem } from './resolve';
import type {
  ApplicationFacts,
  DeterministicMigration,
  UpgradeApplicability,
  UpgradeCatalog,
  UpgradeOperation,
} from './types';
import { compareVersions, isVersion } from './version';

export type CatalogRelation = 'requires' | 'cancels' | 'supersedes';

export type CatalogProblem
  = | { kind: 'invalid-version'; where: string; value: unknown }
    | { kind: 'window-beyond-package'; supportedFrom: string; packageVersion: string }
    | { kind: 'invalid-id'; id: unknown }
    | { kind: 'duplicate-id'; id: string }
    | { kind: 'future-entry'; id: string; introducedIn: string; packageVersion: string }
    | { kind: 'outside-window'; id: string; introducedIn: string; supportedFrom: string }
    | { kind: 'incomplete-window'; id: string; supportsFrom: string; supportedFrom: string }
    | { kind: 'unknown-reference'; id: string; relation: CatalogRelation; target: unknown }
    | { kind: 'impossible-reference'; id: string; relation: CatalogRelation; target: string }
    | { kind: 'conflicting-relations'; id: string; target: string }
    | { kind: 'malformed-applicability'; id: string }
    | { kind: 'malformed-verification'; id: string }
    | { kind: 'dependency-cycle'; ids: string[] }
    | { kind: 'unresolvable-source'; source: string; problem: ResolutionProblem };

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATIONS: CatalogRelation[] = ['requires', 'cancels', 'supersedes'];

interface Context {
  catalog: UpgradeCatalog;
  packageVersion: string;
  problems: CatalogProblem[];
}

export function catalogProblems(catalog: UpgradeCatalog, packageVersion: string): CatalogProblem[] {
  const context: Context = { catalog, packageVersion, problems: [] };

  if (!windowValid(context)) {
    return context.problems;
  }

  const entries = [...catalog.migrations, ...catalog.operations];

  entryIdentities(entries, context);
  entries.filter((entry) => ID.test(entry.id)).forEach((entry) => entryVersions(entry, context));
  catalog.operations.forEach((operation) => operationShape(operation, context));

  if (!context.problems.length) {
    requirementCycles(catalog.operations, context);
  }

  if (!context.problems.length) {
    sourceResolutions(context);
  }

  return context.problems;
}

function windowValid(context: Context): boolean {
  const { catalog, packageVersion, problems } = context;

  for (const where of ['supportedFrom', 'legacyConfigCheckpoint'] as const) {
    if (!isVersion(catalog[where])) {
      problems.push({ kind: 'invalid-version', where, value: catalog[where] });
    }
  }

  if (!problems.length && compareVersions(catalog.supportedFrom, packageVersion) > 0) {
    problems.push({
      kind: 'window-beyond-package', supportedFrom: catalog.supportedFrom, packageVersion,
    });
  }

  return !problems.length;
}

function entryIdentities(
  entries: (DeterministicMigration | UpgradeOperation)[],
  context: Context,
): void {
  const seen = new Set<string>();

  for (const { id } of entries) {
    if (typeof id !== 'string' || !ID.test(id)) {
      context.problems.push({ kind: 'invalid-id', id });
    } else if (seen.has(id)) {
      context.problems.push({ kind: 'duplicate-id', id });
    }

    seen.add(id);
  }
}

function entryVersions(entry: DeterministicMigration | UpgradeOperation, context: Context): void {
  const { catalog, packageVersion, problems } = context;
  const { id, introducedIn } = entry;

  if (!isVersion(introducedIn)) {
    problems.push({ kind: 'invalid-version', where: `${id}.introducedIn`, value: introducedIn });

    return;
  }

  if (compareVersions(introducedIn, packageVersion) > 0) {
    problems.push({ kind: 'future-entry', id, introducedIn, packageVersion });
  }

  if (compareVersions(introducedIn, catalog.supportedFrom) <= 0) {
    problems.push({
      kind: 'outside-window', id, introducedIn, supportedFrom: catalog.supportedFrom,
    });
  }

  if ('supportsFrom' in entry) {
    migrationWindow(entry, context);
  }

  if (!applicabilityValid(entry.applicability, { introducedIn, context })) {
    problems.push({ kind: 'malformed-applicability', id });
  }
}

function migrationWindow(migration: DeterministicMigration, context: Context): void {
  const { supportedFrom } = context.catalog;
  const { id, supportsFrom } = migration;

  if (!isVersion(supportsFrom)) {
    context.problems.push({
      kind: 'invalid-version',
      where: `${id}.supportsFrom`,
      value: supportsFrom,
    });
  } else if (compareVersions(supportsFrom, supportedFrom) > 0) {
    context.problems.push({ kind: 'incomplete-window', id, supportsFrom, supportedFrom });
  }
}

function applicabilityValid(
  applicability: UpgradeApplicability | undefined,
  scope: { introducedIn: string; context: Context },
): boolean {
  switch (applicability?.kind) {
    case 'always':
    case 'legacy-config-shape':
      return true;
    case 'legacy-config-key':
      return (LEGACY_CONFIG_KEYS as readonly string[]).includes(applicability.key);
    case 'source-below':
      return isVersion(applicability.version)
        && compareVersions(applicability.version, scope.context.catalog.supportedFrom) > 0
        && compareVersions(applicability.version, scope.introducedIn) <= 0;
    default:
      return false;
  }
}

function operationShape(operation: UpgradeOperation, context: Context): void {
  if (typeof operation.id !== 'string' || !ID.test(operation.id)) {
    return;
  }

  RELATIONS.forEach((relation) => relationTargets(operation, relation, context));
  conflictingRelations(operation, context);

  const verification = operation.verification;

  const valid = verification?.kind === 'confirm'
    || (verification?.kind === 'no-files'
      && typeof verification.pattern === 'string'
      && /^[^/\\]+$/.test(verification.pattern)
      && !verification.pattern.includes('..'));

  if (!valid) {
    context.problems.push({ kind: 'malformed-verification', id: operation.id });
  }
}

function relationTargets(
  operation: UpgradeOperation,
  relation: CatalogRelation,
  context: Context,
): void {
  const targets: unknown = operation[relation];
  const { id } = operation;

  if (!Array.isArray(targets)) {
    context.problems.push({ kind: 'unknown-reference', id, relation, target: targets });

    return;
  }

  for (const target of targets) {
    const found = context.catalog.operations.find((candidate) => candidate.id === target);

    if (found === undefined || target === id) {
      context.problems.push({ kind: 'unknown-reference', id, relation, target });
    } else if (impossible(operation, found, relation)) {
      context.problems.push({ kind: 'impossible-reference', id, relation, target });
    }
  }
}

function impossible(
  operation: UpgradeOperation,
  target: UpgradeOperation,
  relation: CatalogRelation,
): boolean {
  if (!isVersion(operation.introducedIn) || !isVersion(target.introducedIn)) {
    return false;
  }

  const order = compareVersions(target.introducedIn, operation.introducedIn);

  return relation === 'requires' ? order > 0 : order >= 0;
}

function conflictingRelations(operation: UpgradeOperation, context: Context): void {
  const lists = RELATIONS.map((relation) => operation[relation])
    .filter((targets): targets is readonly string[] => Array.isArray(targets));

  const counts = new Map<string, number>();

  for (const target of lists.flatMap((targets) => [...new Set(targets)])) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  for (const [target, count] of counts) {
    if (count > 1) {
      context.problems.push({ kind: 'conflicting-relations', id: operation.id, target });
    }
  }
}

function requirementCycles(operations: readonly UpgradeOperation[], context: Context): void {
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') {
      return;
    }

    if (state.get(id) === 'visiting') {
      context.problems.push({ kind: 'dependency-cycle', ids: path.slice(path.indexOf(id)) });

      return;
    }

    state.set(id, 'visiting');
    byId.get(id)!.requires.forEach((target) => visit(target, [...path, id]));
    state.set(id, 'done');
  };

  operations.forEach((operation) => visit(operation.id, []));
}

function allApplicable(catalog: UpgradeCatalog): ApplicationFacts[] {
  const keys = catalog.operations.flatMap((operation) =>
    operation.applicability.kind === 'legacy-config-key' ? [operation.applicability.key] : []);

  return [{
    root: '.',
    legacyShape: true,
    legacyKeys: Object.fromEntries(keys.map((key) => [key, []])),
  }];
}

function sourceResolutions(context: Context): void {
  const { catalog, packageVersion } = context;

  const sources = [...new Set([
    catalog.supportedFrom,
    ...[...catalog.migrations, ...catalog.operations].map((entry) => entry.introducedIn),
  ])].filter((source) => compareVersions(source, packageVersion) < 0);

  for (const source of sources) {
    const resolution = resolveUpgrade({
      catalog, source, target: packageVersion, completed: [], facts: allApplicable(catalog),
    });

    if (resolution.status === 'invalid') {
      context.problems.push(...resolution.problems.map((problem) => ({
        kind: 'unresolvable-source' as const, source, problem,
      })));
    }
  }
}
