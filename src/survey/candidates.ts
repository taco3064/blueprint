import path from 'node:path';

import { aliasRoot } from '../config';
import { detectCycles, importAnalysis, resolveSegments, scan, stripAlias } from '../inspect';
import type { ImportRef, ScanResult, ScannedFile } from '../inspect';
import type { SurveyResult } from './survey';
import { dependencyNames } from './survey';

export interface CandidateEdge {
  from: string;
  to: string;
  count: number;
}

export interface TransformationCandidate {
  seed: string;
  source: 'container' | 'page';
  reachableUnits: string[];
  incoming: CandidateEdge[];
  outgoing: CandidateEdge[];
  unresolved: string[];
}

export interface TransformationEvidence {
  sourceRoot: string;
  aliases: Record<string, string>;
  rootWiring: string[];
  sourceLayers: { layer: string; units: string[] }[];
  seedSource: 'containers' | 'pages' | 'none';
  candidates: TransformationCandidate[];
  routerSeeds: string[];
  overlaps: { unit: string; seeds: string[] }[];
  orphans: string[];
  edges: CandidateEdge[];
  cycles: string[][];
  collisionRisks: { identity: string; units: string[] }[];
  unresolvedImports: { unit: string; specifier: string }[];
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

interface CandidateBasis {
  scanned: ScanResult;
  units: Set<string>;
  graph: Map<string, Set<string>>;
  edges: CandidateEdge[];
  unresolvedImports: TransformationEvidence['unresolvedImports'];
}

interface MeasuredUnitGraph {
  graph: Map<string, Set<string>>;
  counts: Map<string, number>;
}

export function collectTransformationEvidence(
  root: string,
  survey: SurveyResult,
): TransformationEvidence {
  const sourceRoot = survey.sourceRoot ?? 'src';
  const basis = candidateBasis(root, survey, sourceRoot);
  const { scanned, units, graph, edges, unresolvedImports } = basis;
  const containerSeeds = seedUnits(units, 'containers');
  const pageSeeds = seedUnits(units, 'pages');
  const routerSeeds = [...pageSeeds, ...seedUnits(units, 'app')].sort();
  const seeds = containerSeeds.length ? containerSeeds : pageSeeds;
  const seedSource = containerSeeds.length ? 'containers' : pageSeeds.length ? 'pages' : 'none';
  const closures = new Map(seeds.map((seed) => [seed, closureOf(seed, graph)]));

  const candidates = seeds.map((seed): TransformationCandidate => {
    const reachable = closures.get(seed) as Set<string>;

    return {
      seed,
      source: seed.startsWith('containers/') ? 'container' : 'page',
      reachableUnits: [...reachable].sort(),
      incoming: edges.filter((edge) => !reachable.has(edge.from) && reachable.has(edge.to)),
      outgoing: edges.filter((edge) => reachable.has(edge.from) && !reachable.has(edge.to)),
      unresolved: unresolvedImports
        .filter((entry) => reachable.has(entry.unit))
        .map((entry) => `${entry.unit}: ${entry.specifier}`),
    };
  });

  const claimed = new Set([...closures.values()].flatMap((closure) => [...closure]));
  const analysis = importAnalysis(scanned);

  return {
    sourceRoot,
    aliases: survey.aliases,
    rootWiring: survey.rootFiles,
    sourceLayers: sourceLayersOf(units),
    seedSource,
    candidates,
    routerSeeds,
    overlaps: overlapsOf(closures),
    orphans: [...units].filter((unit) => !claimed.has(unit)).sort(),
    edges,
    cycles: detectCycles(graph),
    collisionRisks: collisionsOf(units),
    unresolvedImports,
    unknownDynamicImports: analysis.unknownDynamicImports,
    parseFailures: analysis.parseFailures,
  };
}

function candidateBasis(root: string, survey: SurveyResult, sourceRoot: string): CandidateBasis {
  const scanned = scan(root, sourceRoot);

  const aliases = Object.entries(survey.aliases)
    .map(([alias, target]) => aliasRoot(alias, target, sourceRoot))
    .filter((entry): entry is NonNullable<ReturnType<typeof aliasRoot>> => entry !== null);

  const units = unitsOf(scanned);
  const measured = graphOf(scanned, units, aliases);

  return {
    scanned,
    units,
    graph: measured.graph,
    edges: edgeList(measured.counts),
    unresolvedImports: unresolvedOf(scanned, {
      units,
      aliases,
      dependencies: dependencyNames(root).sort((a, b) => b.length - a.length),
    }),
  };
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

function graphOf(
  scanned: ScanResult,
  units: Set<string>,
  aliases: NonNullable<ReturnType<typeof aliasRoot>>[],
): MeasuredUnitGraph {
  const graph = new Map([...units].map((unit) => [unit, new Set<string>()]));
  const counts = new Map<string, number>();

  for (const file of scanned.files) {
    const from = unitOf(file.segments);

    if (!from) {
      continue;
    }

    for (const ref of file.imports) {
      const targetSegments = targetSegmentsOf(file, ref, aliases);
      const to = targetSegments ? unitOf(targetSegments) : null;

      if (to && to !== from && units.has(to)) {
        graph.get(from)?.add(to);
        const key = `${from}\0${to}`;

        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return { graph, counts };
}

function targetSegmentsOf(
  file: ScannedFile,
  ref: ImportRef,
  aliases: NonNullable<ReturnType<typeof aliasRoot>>[],
): string[] | null {
  const absolute = stripAlias(ref.specifier, aliases);

  if (absolute) {
    return absolute;
  }

  return ref.specifier.startsWith('.')
    ? resolveSegments(file.segments.slice(0, -1), ref.specifier)
    : null;
}

function edgeList(counts: Map<string, number>): CandidateEdge[] {
  return [...counts].map(([key, count]) => {
    const [from, to] = key.split('\0');

    return { from, to, count };
  })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function seedUnits(units: Set<string>, layer: string): string[] {
  return [...units].filter((unit) => unit.startsWith(`${layer}/`)).sort();
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
    pending.push(...(graph.get(unit) as Set<string>));
  }

  return reached;
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

function unresolvedOf(
  scanned: ScanResult,
  context: {
    units: Set<string>;
    aliases: NonNullable<ReturnType<typeof aliasRoot>>[];
    dependencies: string[];
  },
): TransformationEvidence['unresolvedImports'] {
  const result: TransformationEvidence['unresolvedImports'] = [];

  for (const file of scanned.files) {
    const unit = unitOf(file.segments);

    if (!unit || !context.units.has(unit)) {
      continue;
    }

    for (const ref of file.imports) {
      const external = context.dependencies.some(
        (name) => ref.specifier === name || ref.specifier.startsWith(`${name}/`),
      );

      if (
        /^[~@#]/.test(ref.specifier)
        && !external
        && !stripAlias(ref.specifier, context.aliases)
      ) {
        result.push({ unit, specifier: ref.specifier });
      }
    }
  }

  return result.sort((a, b) => a.unit.localeCompare(b.unit)
    || a.specifier.localeCompare(b.specifier));
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

function isString(value: string | null): value is string {
  return value !== null;
}
