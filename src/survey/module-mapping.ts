import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { dropTestFiles, importAnalysis, scan } from '../inspect';
import type { SurveyResult } from './survey';
import { collectTransformationEvidence } from './candidates';
import type {
  CandidateEdge,
  RelativeImportEvidence,
} from './candidates';

export interface LayerMappingCandidate {
  source: string;
  destination: string;
  module: string;
  layer: string;
  layout: 'folder' | 'file' | 'container' | 'router';
  disposition: 'move' | 'agent-router-decision' | 'preserve-next-route';
}

export interface ModuleToLayerEvidence {
  sourceRoot: string;
  aliases: Record<string, string>;
  rootWiring: string[];
  modules: { name: string; dependsOn: string[] }[];
  layers: { name: string; layout: 'folder' | 'file'; entry: string }[];
  architectureBasis: Omit<ArchitectureDef, 'modules'>;
  mappings: LayerMappingCandidate[];
  collisions: { destination: string; sources: string[] }[];
  orphans: string[];
  edges: CandidateEdge[];
  cycles: string[][];
  unresolvedAliasLikeImports: { unit: string; specifier: string }[];
  relativeImports: RelativeImportEvidence[];
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

export interface ModuleToLayerEvidenceInput {
  root: string;
  survey: SurveyResult;
  architecture: ArchitectureDef;
  nextAppRouter: boolean;
}

export function collectModuleToLayerEvidence(
  input: ModuleToLayerEvidenceInput,
): ModuleToLayerEvidence {
  const { root, survey, architecture, nextAppRouter } = input;
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first') {
    throw new Error('Module-first → layer-first evidence requires a module-first architecture.');
  }

  const scanned = dropTestFiles(scan(root, resolved.sourceRoot), architecture.testFiles);
  const shared = collectTransformationEvidence(root, survey, architecture);

  const mappings = scanned.files.flatMap((file) => {
    const relative = sourceRelative(file.path, resolved.sourceRoot);
    const position = resolved.classify(file.segments);

    if (relative[0] === 'app') {
      return [routerMapping(relative, resolved.sourceRoot, nextAppRouter)];
    }

    if (!position || position.kind === 'source-root') {
      return [];
    }

    if (position.kind === 'container' || position.kind === 'module') {
      return [{
        source: sourcePath(resolved.sourceRoot, relative),
        destination: sourcePath(
          resolved.sourceRoot,
          ['containers', position.module.name, ...relative.slice(1)].join('/'),
        ),
        module: position.module.name,
        layer: 'containers',
        layout: 'container' as const,
        disposition: 'move' as const,
      }];
    }

    return [{
      source: sourcePath(resolved.sourceRoot, relative),
      destination: sourcePath(resolved.sourceRoot, relative.slice(1).join('/')),
      module: position.module!.name,
      layer: position.layer.name,
      layout: position.layer.unit.layout,
      disposition: 'move' as const,
    }];
  }).sort(compareMappings);

  return {
    sourceRoot: resolved.sourceRoot,
    aliases: Object.fromEntries(resolved.aliasMappings),
    rootWiring: survey.rootFiles,
    modules: resolved.modules.map((module) => ({
      name: module.name,
      dependsOn: module.dependsOn,
    })),
    layers: resolved.layers.map((layer) => ({
      name: layer.name,
      layout: layer.unit.layout,
      entry: layer.unit.entry,
    })),
    architectureBasis: withoutModules(architecture),
    mappings,
    collisions: destinationCollisions(mappings, scanned.files.map((file) => file.path)),
    orphans: scanned.files
      .filter((file) => resolved.classify(file.segments) === null)
      .map((file) => file.path)
      .sort(),
    edges: shared.edges,
    cycles: shared.cycles,
    unresolvedAliasLikeImports: shared.unresolvedAliasLikeImports,
    relativeImports: shared.relativeImports,
    ...importAnalysis(scanned),
  };
}

function routerMapping(
  relative: string[],
  sourceRoot: string,
  nextAppRouter: boolean,
): LayerMappingCandidate {
  const source = sourcePath(sourceRoot, relative);

  return {
    source,
    destination: nextAppRouter
      ? source
      : sourcePath(sourceRoot, ['pages', ...relative.slice(1)].join('/')),
    module: 'app',
    layer: nextAppRouter ? 'app' : 'pages',
    layout: 'router',
    disposition: nextAppRouter ? 'preserve-next-route' : 'agent-router-decision',
  };
}

function withoutModules(architecture: ArchitectureDef): Omit<ArchitectureDef, 'modules'> {
  const result = { ...architecture };

  delete result.modules;

  return result;
}

export function destinationCollisions(
  mappings: LayerMappingCandidate[],
  existingPaths: string[] = [],
): ModuleToLayerEvidence['collisions'] {
  const destinations = new Map<string, Set<string>>();

  const movingSources = new Set(
    mappings.map((mapping) => normalizedPath(mapping.source)),
  );

  for (const mapping of mappings) {
    const identity = normalizedPath(mapping.destination);

    destinations.set(identity, new Set([
      ...(destinations.get(identity) ?? []),
      mapping.source,
    ]));
  }

  for (const existing of existingPaths) {
    const identity = normalizedPath(existing);

    if (destinations.has(identity) && !movingSources.has(identity)) {
      destinations.get(identity)?.add(existing);
    }
  }

  return [...destinations]
    .filter(([, sources]) => sources.size > 1)
    .map(([destination, sources]) => ({
      destination,
      sources: [...sources].sort(),
    }))
    .sort((left, right) => left.destination.localeCompare(right.destination));
}

function normalizedPath(file: string): string {
  return path.posix.normalize(file).toLocaleLowerCase('en-US');
}

function sourceRelative(file: string, sourceRoot: string): string[] {
  const segments = file.split('/');
  const root = sourceRoot === '.' ? [] : sourceRoot.split('/');

  return segments.slice(root.length);
}

function sourcePath(sourceRoot: string, relative: string | string[]): string {
  const tail = Array.isArray(relative) ? relative.join('/') : relative;

  return sourceRoot === '.' ? tail : `${sourceRoot}/${tail}`;
}

function compareMappings(left: LayerMappingCandidate, right: LayerMappingCandidate): number {
  return left.destination.localeCompare(right.destination)
    || left.source.localeCompare(right.source);
}
