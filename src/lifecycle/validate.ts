import { LEGACY_CONFIG_KEYS } from './catalog';
import { resolveUpgrade } from './resolve';
import type { ResolutionProblem } from './resolve';
import type {
  ApplicationFacts,
  DeterministicMigration,
  RetiredOperation,
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
    | { kind: 'retired-in-window'; id: string; introducedIn: string; supportedFrom: string }
    | { kind: 'incomplete-window'; id: string; supportsFrom: string; supportedFrom: string }
    | { kind: 'unknown-reference'; id: string; relation: CatalogRelation; target: unknown }
    | { kind: 'impossible-reference'; id: string; relation: CatalogRelation; target: string }
    | { kind: 'conflicting-relations'; id: string; target: string }
    | { kind: 'malformed-applicability'; id: string }
    | { kind: 'malformed-verification'; id: string }
    | { kind: 'unresolvable-source'; source: string; problem: ResolutionProblem }
    | { kind: 'unresolvable-route'; source: string; target: string; problem: ResolutionProblem };

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

  const seen = new Set<string>();
  const identified = entryIdentities([...catalog.migrations, ...catalog.operations], context, seen);

  identified.forEach((entry) => entryVersions(entry, context));

  entryIdentities(catalog.retired, context, seen)
    .forEach((entry) => retiredVersion(entry, context));

  catalog.operations
    .filter((operation) => identified.includes(operation))
    .forEach((operation) => operationShape(operation, context));

  if (!context.problems.length) {
    sourceResolution(context);
  }

  if (!context.problems.length) {
    routeResolution(context);
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

function entryIdentities<T extends { id: string }>(
  entries: readonly T[],
  context: Context,
  seen: Set<string>,
): T[] {
  return entries.filter(({ id }) => {
    const valid = typeof id === 'string' && ID.test(id);

    if (!valid) {
      context.problems.push({ kind: 'invalid-id', id });
    } else if (seen.has(id)) {
      context.problems.push({ kind: 'duplicate-id', id });
    }

    seen.add(id);

    return valid;
  });
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

function retiredVersion(entry: RetiredOperation, context: Context): void {
  const { supportedFrom } = context.catalog;
  const { id, introducedIn } = entry;

  if (!isVersion(introducedIn)) {
    context.problems.push({
      kind: 'invalid-version', where: `${id}.introducedIn`, value: introducedIn,
    });
  } else if (compareVersions(introducedIn, supportedFrom) > 0) {
    context.problems.push({ kind: 'retired-in-window', id, introducedIn, supportedFrom });
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
  if (applicability?.kind === 'always' || applicability?.kind === 'legacy-config-shape') {
    return true;
  }

  if (applicability?.kind === 'legacy-config-key') {
    return (LEGACY_CONFIG_KEYS as readonly string[]).includes(applicability.key);
  }

  return applicability?.kind === 'source-below'
    && isVersion(applicability.version)
    && compareVersions(applicability.version, scope.context.catalog.supportedFrom) > 0
    && compareVersions(applicability.version, scope.introducedIn) <= 0;
}

function operationShape(operation: UpgradeOperation, context: Context): void {
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

  const known = relation === 'supersedes'
    ? [...context.catalog.operations, ...context.catalog.retired]
    : context.catalog.operations;

  for (const target of targets) {
    const found = known.find((candidate) => candidate.id === target);

    if (found === undefined || target === id) {
      context.problems.push({ kind: 'unknown-reference', id, relation, target });
    } else if (impossible(operation, found, relation)) {
      context.problems.push({ kind: 'impossible-reference', id, relation, target });
    }
  }
}

function impossible(
  operation: UpgradeOperation,
  target: RetiredOperation,
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

function resolutionProblems(context: Context, target: string): ResolutionProblem[] {
  const facts: ApplicationFacts[] = [{
    root: '.',
    legacyShape: true,
    // Stryker disable next-line ArrayDeclaration: evidence lists never change a resolution.
    legacyKeys: Object.fromEntries(LEGACY_CONFIG_KEYS.map((key) => [key, []])),
  }];

  const resolution = resolveUpgrade({
    catalog: context.catalog,
    source: context.catalog.supportedFrom,
    target,
    // Stryker disable next-line ArrayDeclaration: an id no operation owns completes nothing.
    completed: [],
    facts,
  });

  return resolution.status === 'invalid' ? resolution.problems : [];
}

function sourceResolution(context: Context): void {
  const source = context.catalog.supportedFrom;

  context.problems.push(...resolutionProblems(context, context.packageVersion).map((problem) => ({
    kind: 'unresolvable-source' as const, source, problem,
  })));
}

// A later release's cancel or supersede can hide from the full window a failure that a route
// stopping earlier still meets. Relations only reach older operations and completed work only
// removes constraints, so every route's failure also shows on supportedFrom → its target.
function routeResolution(context: Context): void {
  const { operations, supportedFrom: source } = context.catalog;

  const releases = [...new Set(operations.map((operation) => operation.introducedIn))]
    .sort(compareVersions);

  for (const target of releases) {
    context.problems.push(...resolutionProblems(context, target).map((problem) => ({
      kind: 'unresolvable-route' as const, source, target, problem,
    })));
  }
}
