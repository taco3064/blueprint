import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef, ResolvedArchitecture } from '../config';
import {
  buildUnitGraph,
  detectCycles,
  dropTestFiles,
  importAnalysis,
  positionKey,
  scan,
} from '../inspect';
import type { ScanResult, ScannedFile } from '../inspect';
import type { SurveyResult } from './survey';
import { dependencyNames } from './survey';

export interface CandidateEdge {
  from: string;
  to: string;
  count: number;
}

export interface RelativeImportEvidence {
  importer: string;
  specifier: string;
  structuralTarget: string | null;
  targetUnitMeasured: boolean;
}

export interface TransformationCandidate {
  seed: string;
  source: 'container' | 'page' | 'app';
  reachableUnits: string[];
  directImports: CandidateEdge[];
  closureEdges: CandidateEdge[];
  closureConsumers: CandidateEdge[];
  unresolvedAliasLikeImports: string[];
}

export interface TransformationEvidence {
  sourceRoot: string;
  aliases: Record<string, string>;
  resolutionBasis: 'blueprint-config' | 'survey-detected';
  rootWiring: string[];
  sourceLayers: { layer: string; units: string[] }[];
  seedSource: 'containers' | 'pages' | 'none';
  candidates: TransformationCandidate[];
  routerCandidates: TransformationCandidate[];
  overlaps: { unit: string; seeds: string[] }[];
  orphans: string[];
  edges: CandidateEdge[];
  cycles: string[][];
  collisionRisks: { identity: string; units: string[] }[];
  unresolvedAliasLikeImports: { unit: string; specifier: string }[];
  relativeImports: RelativeImportEvidence[];
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

interface CandidateBasis {
  scanned: ScanResult;
  physicalUnits: Set<string>;
  governedUnits: Set<string>;
  graph: Map<string, Set<string>>;
  edges: CandidateEdge[];
  resolved: ResolvedArchitecture;
  unresolvedAliasLikeImports: TransformationEvidence['unresolvedAliasLikeImports'];
  relativeImports: RelativeImportEvidence[];
}

interface CandidateContext {
  graph: Map<string, Set<string>>;
  edges: CandidateEdge[];
  basis: CandidateBasis;
}

export function collectTransformationEvidence(
  root: string,
  survey: SurveyResult,
  architecture: ArchitectureDef | null = null,
): TransformationEvidence {
  const basis = candidateBasis(root, survey, architecture);
  const routeEdges = routeEdgeList(basis);

  const evidenceEdges = mergeEdges([
    ...basis.edges.filter((edge) => edge.from !== 'pages' && edge.from !== 'app'),
    ...routeEdges,
  ]);

  const evidenceGraph = graphFrom(evidenceEdges, basis.governedUnits);
  const containerSeeds = seedUnits(basis.governedUnits, 'containers');
  const routerSeeds = routeSeedsOf(basis.scanned);
  const pageSeeds = routerSeeds.filter((seed) => seed.startsWith('pages/'));
  const seeds = containerSeeds.length ? containerSeeds : pageSeeds;
  const seedSource = containerSeeds.length ? 'containers' : pageSeeds.length ? 'pages' : 'none';
  const context = { graph: evidenceGraph, edges: evidenceEdges, basis };
  const candidates = seeds.map((seed) => candidateOf(seed, context));

  const routerCandidates = routerSeeds.map(
    (seed) => candidateOf(seed, context),
  );

  const domainClosures = new Map(candidates.map(
    (candidate) => [candidate.seed, new Set(candidate.reachableUnits)],
  ));

  const claimed = new Set(
    [...candidates, ...routerCandidates].flatMap((candidate) => candidate.reachableUnits),
  );

  return {
    sourceRoot: basis.resolved.sourceRoot,
    aliases: Object.fromEntries(basis.resolved.aliasMappings),
    resolutionBasis: architecture ? 'blueprint-config' : 'survey-detected',
    rootWiring: survey.rootFiles,
    sourceLayers: sourceLayersOf(basis.physicalUnits),
    seedSource,
    candidates,
    routerCandidates,
    overlaps: overlapsOf(domainClosures),
    orphans: [...basis.governedUnits]
      .filter((unit) => !claimed.has(unit) && unit !== 'pages' && unit !== 'app')
      .sort(),
    edges: basis.edges,
    cycles: detectCycles(basis.graph),
    collisionRisks: collisionsOf(basis.physicalUnits),
    unresolvedAliasLikeImports: basis.unresolvedAliasLikeImports,
    relativeImports: basis.relativeImports,
    ...importAnalysis(basis.scanned),
  };
}

function candidateBasis(
  root: string,
  survey: SurveyResult,
  architecture: ArchitectureDef | null,
): CandidateBasis {
  const definition = architecture ?? surveyedArchitecture(survey);
  const resolved = resolveArchitecture(definition);
  const scanned = dropTestFiles(scan(root, resolved.sourceRoot), definition.testFiles);
  const measured = buildUnitGraph(scanned, definition);
  const dependencies = dependencyNames(root).sort((a, b) => b.length - a.length);

  return {
    scanned,
    physicalUnits: unitsOf(scanned),
    governedUnits: measured.units,
    graph: measured.edges,
    edges: edgeList(measured.counts),
    resolved,
    unresolvedAliasLikeImports: unresolvedAliasLikeOf(scanned, resolved, dependencies),
    relativeImports: relativeImportsOf(scanned, resolved, measured.units),
  };
}

function surveyedArchitecture(survey: SurveyResult): ArchitectureDef {
  const sourceRoot = survey.sourceRoot ?? 'src';
  const entries = Object.entries(survey.aliases);
  const canonical = entries.find(([, target]) => normalized(target) === normalized(sourceRoot));
  const alias = canonical?.[0] ?? '~app';

  return {
    alias,
    sourceRoot,
    additionalAliases: Object.fromEntries(entries.filter(([candidate]) => candidate !== alias)),
    layers: survey.folders.map((entry) => ({
      name: entry.folder,
      does: 'survey-detected layer used only for transformation evidence',
      layout: 'folder',
    })),
  };
}

function routeEdgeList(basis: CandidateBasis): CandidateEdge[] {
  const counts = new Map<string, number>();

  for (const file of basis.scanned.files) {
    const seed = routeSeedOf(file);

    if (!seed) {
      continue;
    }

    const importer = basis.resolved.classify(file.segments);

    if (importer && positionKey(importer) === seed) {
      continue;
    }

    for (const ref of file.imports) {
      const target = basis.resolved.resolveImport(file.segments, ref.specifier).target;
      const to = target ? positionKey(target) : null;

      if (to && to !== seed) {
        const key = `${seed}\0${to}`;

        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return edgeList(counts);
}

function candidateOf(
  seed: string,
  context: CandidateContext,
): TransformationCandidate {
  const reachable = closureOf(seed, context.graph);
  const { edges, basis } = context;

  return {
    seed,
    source: seed.startsWith('containers/')
      ? 'container'
      : seed === 'containers'
        ? 'container'
        : seed.startsWith('app/') ? 'app' : 'page',
    reachableUnits: [...reachable].sort(),
    directImports: edges.filter((edge) => edge.from === seed),
    closureEdges: edges.filter((edge) => reachable.has(edge.from) && reachable.has(edge.to)),
    closureConsumers: edges.filter(
      (edge) => !reachable.has(edge.from) && reachable.has(edge.to),
    ),
    unresolvedAliasLikeImports: basis.unresolvedAliasLikeImports
      .filter((entry) => reachable.has(entry.unit))
      .map((entry) => `${entry.unit}: ${entry.specifier}`),
  };
}

function routeSeedsOf(scanned: ScanResult): string[] {
  return [...new Set(scanned.files.map(routeSeedOf).filter(isString))].sort();
}

function routeSeedOf(file: ScannedFile): string | null {
  return file.segments[0] === 'pages' || file.segments[0] === 'app'
    ? unitOf(file.segments)
    : null;
}

function unitsOf(scanned: ScanResult): Set<string> {
  return new Set(scanned.files.map((file) => unitOf(file.segments)).filter(isString));
}

function unitOf(segments: string[]): string | null {
  if (segments.length < 2) {
    return null;
  }

  const second = segments[1];
  const name = segments.length === 2 ? second.replace(/\.[^.]+$/, '') : second;

  return `${segments[0]}/${name}`;
}

function graphFrom(edges: CandidateEdge[], units: Set<string>): Map<string, Set<string>> {
  const graph = new Map([...units].map((unit) => [unit, new Set<string>()]));

  for (const edge of edges) {
    graph.set(edge.from, (graph.get(edge.from) ?? new Set()).add(edge.to));
  }

  return graph;
}

function edgeList(counts: Map<string, number>): CandidateEdge[] {
  return [...counts].map(([key, count]) => {
    const [from, to] = key.split('\0');

    return { from, to, count };
  }).sort(compareEdges);
}

function mergeEdges(edges: CandidateEdge[]): CandidateEdge[] {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}`;

    counts.set(key, (counts.get(key) ?? 0) + edge.count);
  }

  return edgeList(counts);
}

function compareEdges(left: CandidateEdge, right: CandidateEdge): number {
  return left.from.localeCompare(right.from) || left.to.localeCompare(right.to);
}

function seedUnits(units: Set<string>, layer: string): string[] {
  return [...units]
    .filter((unit) => unit === layer || unit.startsWith(`${layer}/`))
    .sort();
}

function closureOf(seed: string, graph: Map<string, Set<string>>): Set<string> {
  const reached = new Set<string>();
  const pending = [seed];

  while (pending.length) {
    const unit = pending.pop() as string;

    if (reached.has(unit)) {
      continue;
    }

    reached.add(unit);
    pending.push(...(graph.get(unit) ?? []));
  }

  return reached;
}

function unresolvedAliasLikeOf(
  scanned: ScanResult,
  resolved: ResolvedArchitecture,
  dependencies: string[],
): TransformationEvidence['unresolvedAliasLikeImports'] {
  const configured = resolved.aliasMappings.map(([alias]) => alias);

  const entries = scanned.files.flatMap((file) => {
    const unit = evidenceUnitOf(file, resolved);

    return file.imports.flatMap((ref) => {
      const external = dependencies.some(
        (name) => ref.specifier === name || ref.specifier.startsWith(`${name}/`),
      );

      const declared = configured.some(
        (alias) => ref.specifier === alias || ref.specifier.startsWith(`${alias}/`),
      );

      return unit && /^[~@#]/.test(ref.specifier) && !external && !declared
        ? [{ unit, specifier: ref.specifier }]
        : [];
    });
  });

  return entries.sort((a, b) => a.unit.localeCompare(b.unit)
    || a.specifier.localeCompare(b.specifier));
}

function relativeImportsOf(
  scanned: ScanResult,
  resolved: ResolvedArchitecture,
  units: Set<string>,
): RelativeImportEvidence[] {
  const entries = scanned.files.flatMap((file) => file.imports.flatMap((ref) => {
    if (!ref.specifier.startsWith('.')) {
      return [];
    }

    const target = resolved.resolveImport(file.segments, ref.specifier).target;
    const structuralTarget = target ? positionKey(target) : null;

    return [{
      importer: evidenceUnitOf(file, resolved) ?? file.path,
      specifier: ref.specifier,
      structuralTarget,
      targetUnitMeasured: structuralTarget !== null && units.has(structuralTarget),
    }];
  }));

  return entries.sort((a, b) => a.importer.localeCompare(b.importer)
    || a.specifier.localeCompare(b.specifier));
}

function evidenceUnitOf(file: ScannedFile, resolved: ResolvedArchitecture): string | null {
  const route = routeSeedOf(file);

  if (route) {
    return route;
  }

  const position = resolved.classify(file.segments);

  return position ? positionKey(position) : null;
}

function overlapsOf(closures: Map<string, Set<string>>): TransformationEvidence['overlaps'] {
  const owners = new Map<string, string[]>();

  for (const [seed, closure] of closures) {
    for (const unit of closure) {
      owners.set(unit, [...(owners.get(unit) ?? []), seed]);
    }
  }

  return [...owners]
    .filter(([, seeds]) => seeds.length > 1)
    .map(([unit, seeds]) => ({ unit, seeds: seeds.sort() }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

function sourceLayersOf(units: Set<string>): TransformationEvidence['sourceLayers'] {
  const layers = new Map<string, string[]>();

  for (const unit of units) {
    const layer = unit.split('/')[0];

    layers.set(layer, [...(layers.get(layer) ?? []), unit]);
  }

  return [...layers].map(([layer, entries]) => ({ layer, units: entries.sort() }))
    .sort((a, b) => a.layer.localeCompare(b.layer));
}

function collisionsOf(units: Set<string>): TransformationEvidence['collisionRisks'] {
  const identities = new Map<string, string[]>();

  for (const unit of units) {
    const identity = path.posix.normalize(unit).toLocaleLowerCase('en-US');

    identities.set(identity, [...(identities.get(identity) ?? []), unit]);
  }

  return [...identities]
    .filter(([, entries]) => entries.length > 1)
    .map(([identity, entries]) => ({ identity, units: entries.sort() }))
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

function normalized(value: string): string {
  return value.replace(/^\.\//, '').replace(/\/$/, '') || '.';
}

function isString(value: string | null): value is string {
  return value !== null;
}
