import type { AllowedImporter, ArchitectureDef, Framework, LayerDef } from './types';
import {
  aliasLayerRoots,
  aliasSpecifier,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';
import { dependencyVerdict } from './dependency';
import type { ResolvedDependencyVerdict } from './dependency';
import { resolveModules } from './modules';
import type { ResolvedModule } from './modules';

export type { ResolvedDependencyEndpoint, ResolvedDependencyVerdict } from './dependency';
export type { ResolvedModule } from './modules';

export interface ResolvedLayer {
  definition: LayerDef;
  name: string;
  unit: { layout: 'folder' | 'file'; entry: string };
  allowedImporters: AllowedImporter[];
}

export interface ResolvedLayerPosition {
  kind: 'layer';
  module: ResolvedModule | null;
  layer: ResolvedLayer;
  root: string;
}

export type ResolvedSourcePosition
  = | { kind: 'source-root' }
    | { kind: 'module'; module: ResolvedModule }
    | { kind: 'container'; module: ResolvedModule }
    | ResolvedLayerPosition
    | {
      kind: 'unit';
      module: ResolvedModule | null;
      layer: ResolvedLayer;
      root: string;
      unit: string;
    };

export interface ResolveArchitectureContext {
  nextAppRouter?: { module: string };
}

export interface ResolvedArchitecture {
  definition: ArchitectureDef;
  sourceRoot: string;
  topology: 'layer-first' | 'module-first';
  modules: ResolvedModule[];
  layers: ResolvedLayer[];
  layerPositions: ResolvedLayerPosition[];
  layerNames: string[];
  aliases: AliasRoot[];
  aliasMappings: [string, string][];
  ownership: ResolvedLayer[];
  diagramEdges: DiagramEdge[];
  hasSelfOnly: boolean;
  classify(file: string | string[]): ResolvedSourcePosition | null;
  matchLayer(file: string | string[]): ResolvedLayer | null;
  resolveLayerRoot(layer: string, module?: string): string | null;
  resolveLayerRoots(layer: string): string[];
  layerFiles(layer: string, framework: Framework, module?: string): string[];
  containerFiles(framework: Framework): string[];
  resolveImportTarget(
    importer: string | string[],
    specifier: string,
  ): ResolvedSourcePosition | null;
  canImportModule(from: string, to: string): boolean;
  dependencyVerdict(
    importer: ResolvedSourcePosition,
    target: ResolvedSourcePosition,
  ): ResolvedDependencyVerdict | null;
  canImport(from: string, to: string): boolean;
  forbiddenLayers(layer: string): string[];
  selfOnlyTargets(layer: string): string[];
  aliasSpecifiers(layer: string, module?: string): string[];
}

export function resolveArchitecture(
  definition: ArchitectureDef,
  _context: ResolveArchitectureContext = {},
): ResolvedArchitecture {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const sourceSegments = segments(sourceRoot);
  const aliases = aliasLayerRoots(definition);

  const modules = resolveModules(definition.modules ?? [], sourceRoot);

  const layers: ResolvedLayer[] = definition.layers.map((layer, index) => ({
    definition: layer,
    name: layer.name,
    unit: getUnitShape(definition, layer.name),
    allowedImporters: layer.allowedImporters === undefined
      ? definition.layers.slice(0, index).map((candidate) => ({ layer: candidate.name }))
      : normalizeAllowedImporters(layer.allowedImporters),
  }));

  const byModule = new Map(modules.map((module) => [module.name, module]));
  const byLayer = new Map(layers.map((layer) => [layer.name, layer]));
  const topology = modules.length ? 'module-first' : 'layer-first';

  const ordinaryModules = topology === 'module-first'
    ? modules.filter((module) => module.name !== 'app')
    : modules;

  const layerPositions = topology === 'module-first'
    ? ordinaryModules.flatMap((module) => layers.map((layer) => ({
        kind: 'layer' as const,
        module,
        layer,
        root: joinSource(module.root, layer.name),
      })))
    : layers.map((layer) => ({
        kind: 'layer' as const,
        module: null,
        layer,
        root: joinSource(sourceRoot, layer.name),
      }));

  const classify = (file: string | string[]): ResolvedSourcePosition | null => {
    const relative = Array.isArray(file)
      ? file
      : stripSourceRoot(segments(file), sourceSegments);

    return topology === 'module-first'
      ? classifyModuleFirst(relative, { byModule, byLayer })
      : classifyLayerFirst(relative, byLayer);
  };

  const canImport = (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return byLayer.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
  };

  const canImportModule = (from: string, to: string): boolean =>
    from === to || byModule.get(from)?.reachable.includes(to) === true;

  return buildResolvedArchitecture({
    definition,
    sourceRoot,
    sourceSegments,
    topology,
    modules,
    ordinaryModules,
    layers,
    layerPositions,
    aliases,
    byModule,
    byLayer,
    classify,
    canImport,
    canImportModule,
  });
}

function stripSourceRoot(parts: string[], sourceSegments: string[]): string[] {
  return startsWith(parts, sourceSegments) ? parts.slice(sourceSegments.length) : parts;
}

interface ResolutionState {
  definition: ArchitectureDef;
  sourceRoot: string;
  sourceSegments: string[];
  topology: 'layer-first' | 'module-first';
  modules: ResolvedModule[];
  ordinaryModules: ResolvedModule[];
  layers: ResolvedLayer[];
  layerPositions: ResolvedLayerPosition[];
  aliases: AliasRoot[];
  byModule: Map<string, ResolvedModule>;
  byLayer: Map<string, ResolvedLayer>;
  classify: ResolvedArchitecture['classify'];
  canImport: ResolvedArchitecture['canImport'];
  canImportModule: ResolvedArchitecture['canImportModule'];
}

function buildResolvedArchitecture(state: ResolutionState): ResolvedArchitecture {
  const {
    definition, sourceRoot, sourceSegments, topology, modules, ordinaryModules, layers,
    layerPositions,
    aliases, byModule, byLayer, classify, canImport, canImportModule,
  } = state;

  return {
    definition,
    sourceRoot,
    topology,
    modules,
    layers,
    layerPositions,
    layerNames: layers.map((layer) => layer.name),
    aliases,
    aliasMappings: [
      [definition.alias, sourceRoot],
      ...Object.entries(definition.additionalAliases ?? {}),
    ],
    ownership: layers.filter((layer) => layer.definition.owns?.length),
    diagramEdges: resolveDiagramEdges(layers),
    hasSelfOnly: layers.some((layer) => layer.allowedImporters.some((entry) => entry.selfOnly)),
    classify,
    matchLayer(file) {
      const position = classify(file);

      return position && 'layer' in position ? position.layer : null;
    },
    resolveLayerRoot(layer, module) {
      if (topology === 'layer-first') {
        return byLayer.has(layer) ? joinSource(sourceRoot, layer) : null;
      }

      return module && module !== 'app' && byModule.has(module) && byLayer.has(layer)
        ? joinSource(joinSource(sourceRoot, module), layer)
        : null;
    },
    resolveLayerRoots(layer) {
      if (!byLayer.has(layer)) {
        return [];
      }

      return topology === 'layer-first'
        ? [joinSource(sourceRoot, layer)]
        : ordinaryModules.map((module) => joinSource(module.root, layer));
    },
    layerFiles(layer, framework, module) {
      const moduleNames = topology === 'module-first'
        ? module
          ? module === 'app' ? [] : [module]
          : ordinaryModules.map((entry) => entry.name)
        : [undefined];

      return moduleNames.flatMap((moduleName) => resolveLayerFilePatterns(layer, framework, {
        layerFiles: definition.layerFiles,
        sourceRoot,
        module: moduleName,
      }));
    },
    containerFiles(framework) {
      return modules.map((module) => module.name === 'app'
        ? `${module.root}/**/*.{${FRAMEWORK_EXTS[framework]}}`
        : `${module.root}/*.{${FRAMEWORK_EXTS[framework]}}`);
    },
    resolveImportTarget(importer, specifier) {
      if (!classify(importer)) {
        return null;
      }

      const aliasTarget = resolveAliasTarget(aliases, specifier);

      if (aliasTarget !== undefined) {
        return aliasTarget === null || aliasTarget.length === 0 ? null : classify(aliasTarget);
      }

      if (!specifier.startsWith('.')) {
        return null;
      }

      const importerParts = Array.isArray(importer) ? importer : segments(importer);

      const relative = startsWith(importerParts, sourceSegments)
        ? importerParts.slice(sourceSegments.length)
        : importerParts;

      const target = resolveRelative(relative.slice(0, -1), specifier);

      return target ? classify(target) : null;
    },
    canImportModule,
    dependencyVerdict: (importer, target) => dependencyVerdict(importer, target, {
      canImport,
      canImportModule,
    }),
    canImport,
    forbiddenLayers(layer) {
      return layers.filter((target) => target.name !== layer && !canImport(layer, target.name))
        .map((target) => target.name);
    },
    selfOnlyTargets(layer) {
      return layers.filter((target) => target.allowedImporters
        .some((importer) => importer.layer === layer && importer.selfOnly))
        .map((target) => target.name);
    },
    aliasSpecifiers(layer, module) {
      const target = module ? `${module}/${layer}` : layer;

      return aliases.flatMap((root) => aliasSpecifier(root, target) ?? []);
    },
  };
}

function resolveDiagramEdges(layers: ResolvedLayer[]): DiagramEdge[] {
  return layers.flatMap((layer, index): DiagramEdge[] => {
    if (layer.definition.allowedImporters !== undefined) {
      return layer.allowedImporters.map((importer) => ({
        from: importer.layer,
        to: layer.name,
        selfOnly: importer.selfOnly,
        description: importer.description,
      }));
    }

    return index === 0 ? [] : [{ from: layers[index - 1].name, to: layer.name, ordered: true }];
  });
}

function classifyLayerFirst(
  relative: string[],
  byLayer: Map<string, ResolvedLayer>,
): ResolvedSourcePosition | null {
  if (relative.length === 0 || (relative.length === 1 && isSourceFile(relative[0]))) {
    return { kind: 'source-root' };
  }

  const layer = byLayer.get(relative[0]);

  if (!layer) {
    return null;
  }

  const root = relative[0];

  return relative.length === 1
    ? { kind: 'layer', module: null, layer, root }
    : { kind: 'unit', module: null, layer, root, unit: unitName(relative, 1) };
}

function classifyModuleFirst(
  relative: string[],
  scope: {
    byModule: Map<string, ResolvedModule>;
    byLayer: Map<string, ResolvedLayer>;
  },
): ResolvedSourcePosition | null {
  if (relative.length === 0 || (relative.length === 1 && isSourceFile(relative[0]))) {
    return { kind: 'source-root' };
  }

  const module = scope.byModule.get(relative[0]);

  if (!module) {
    return null;
  }

  if (relative.length === 1) {
    return { kind: 'module', module };
  }

  if (module.name === 'app') {
    return { kind: 'container', module };
  }

  const layer = scope.byLayer.get(relative[1]);

  if (!layer) {
    return isSourceFile(relative[1]) ? { kind: 'container', module } : null;
  }

  const root = `${module.name}/${layer.name}`;

  return relative.length === 2
    ? { kind: 'layer', module, layer, root }
    : { kind: 'unit', module, layer, root, unit: unitName(relative, 2) };
}

function unitName(relative: string[], index: number): string {
  return relative[index].replace(/\.[^.]+$/, '');
}

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

export function resolveLayerFilePatterns(
  layer: string,
  framework: Framework,
  scope: { layerFiles?: string | string[]; sourceRoot?: string; module?: string } = {},
): string[] {
  const sourceRoot = scope.sourceRoot ?? 'src';

  const root = scope.module
    ? joinSource(joinSource(sourceRoot, scope.module), '{layer}')
    : joinSource(sourceRoot, '{layer}');

  const declared = scope.layerFiles === undefined
    ? [`${root}/**/*.{${FRAMEWORK_EXTS[framework]}}`]
    : toArray(scope.layerFiles);

  return declared.map((glob) => glob
    .replace(/\{\s*module\s*\}/g, () => scope.module ?? '{module}')
    .replace(/\{\s*layer\s*\}/g, () => layer));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function resolveAliasTarget(aliases: AliasRoot[], specifier: string): string[] | null | undefined {
  const root = aliases.find(
    (candidate) => specifier === candidate.alias || specifier.startsWith(`${candidate.alias}/`),
  );

  if (!root) {
    return undefined;
  }

  const parts = specifier.slice(root.alias.length).split('/').filter(Boolean);

  if (!startsWith(parts, root.prefix)) {
    return null;
  }

  return [...(root.prepend ?? []), ...parts.slice(root.prefix.length)];
}

function joinSource(sourceRoot: string, part: string): string {
  return sourceRoot === '.' ? part : `${sourceRoot}/${part}`;
}

function segments(value: string): string[] {
  return value.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
}

function resolveRelative(from: string[], specifier: string): string[] | null {
  const result = [...from];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      if (result.pop() === undefined) {
        return null;
      }
    } else {
      result.push(part);
    }
  }

  return result;
}

function isSourceFile(value: string): boolean {
  return /\.(?:js|jsx|ts|tsx|mjs|cjs|vue)$/.test(value);
}
