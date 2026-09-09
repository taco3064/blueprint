import type {
  AllowedImporter,
  ArchitectureDef,
  Framework,
  LayerDef,
  ModuleDef,
} from './types';
import {
  aliasLayerRoots,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';
import { createPathMethods } from './resolved-paths';
export { resolveLayerFilePatterns } from './resolved-paths';

export interface ResolvedUnitShape {
  layout: 'folder' | 'file';
  entry: string;
}

export interface ResolvedLayer {
  definition: LayerDef;
  name: string;
  /** Layer-first physical root. Null when the same layer repeats across modules. */
  root: string | null;
  unit: ResolvedUnitShape;
  allowedImporters: AllowedImporter[];
}

export interface ResolvedModule {
  definition: ModuleDef;
  name: string;
  root: string;
}

export type ResolvedPositionKind
  = | 'source-root'
    | 'undeclared-module'
    | 'module'
    | 'container'
    | 'layer'
    | 'unit';

export type ResolvedInnerPosition = 'container' | 'layer' | null;

export interface ResolveArchitectureContext {
  /** Modules whose descendants are framework-owned Next.js App Router source. */
  nextAppRouterModules?: string[];
}

export interface ResolvedPosition {
  kind: ResolvedPositionKind;
  path: string[];
  module: ResolvedModule | null;
  layer: ResolvedLayer | null;
  unit: string | null;
  /** Stable dependency position consumed by #433: container or declared layer. */
  inner: ResolvedInnerPosition;
}

export interface ResolvedArchitecture {
  definition: ArchitectureDef;
  sourceRoot: string;
  moduleFirst: boolean;
  modules: ResolvedModule[];
  moduleNames: string[];
  layers: ResolvedLayer[];
  layerNames: string[];
  aliases: AliasRoot[];
  aliasMappings: [string, string][];
  ownership: ResolvedLayer[];
  diagramEdges: DiagramEdge[];
  hasSelfOnly: boolean;
  matchModule(file: string | string[]): ResolvedModule | null;
  matchLayer(file: string | string[]): ResolvedLayer | null;
  classify(file: string | string[], context?: ResolveArchitectureContext): ResolvedPosition;
  resolveModuleRoot(module: string): string | null;
  resolveLayerRoot(layer: string): string | null;
  resolveModuleLayerRoot(module: string, layer: string): string | null;
  layerFiles(layer: string, framework: Framework): string[];
  moduleLayerFiles(module: string, layer: string, framework: Framework): string[];
  resolveImportPosition(
    importer: string | string[],
    specifier: string,
    context?: ResolveArchitectureContext,
  ): ResolvedPosition | null;
  resolveImportTarget(importer: string | string[], specifier: string): ResolvedLayer | null;
  canImport(from: string, to: string): boolean;
  forbiddenLayers(layer: string): string[];
  selfOnlyTargets(layer: string): string[];
  aliasSpecifiers(layer: string, module?: string): string[];
}

export interface ResolverState {
  definition: ArchitectureDef;
  sourceRoot: string;
  sourceSegments: string[];
  moduleFirst: boolean;
  modules: ResolvedModule[];
  layers: ResolvedLayer[];
  aliases: AliasRoot[];
  moduleByName: Map<string, ResolvedModule>;
  layerByName: Map<string, ResolvedLayer>;
}

interface PositionIdentity {
  module?: ResolvedModule | null;
  layer?: ResolvedLayer | null;
  unit?: string | null;
  inner?: ResolvedInnerPosition;
}

export function resolveArchitecture(definition: ArchitectureDef): ResolvedArchitecture {
  const state = resolveState(definition);
  const relativeParts = makeRelativeParts(state);
  const classify = makeClassifier(state, relativeParts);
  const canImport = makeCanImport(state);

  return assembleResolved({ state, relativeParts, classify, canImport });
}

function resolveState(definition: ArchitectureDef): ResolverState {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const moduleFirst = definition.modules !== undefined;
  const modules = resolveModules(definition.modules, sourceRoot);
  const layers = resolveLayers(definition, sourceRoot, moduleFirst);

  return {
    definition,
    sourceRoot,
    sourceSegments: segments(sourceRoot),
    moduleFirst,
    modules,
    layers,
    aliases: aliasLayerRoots(definition),
    moduleByName: new Map(modules.map((module) => [module.name, module])),
    layerByName: new Map(layers.map((layer) => [layer.name, layer])),
  };
}

function resolveModules(
  definitions: ModuleDef[] | undefined,
  sourceRoot: string,
): ResolvedModule[] {
  return (definitions ?? []).map((module) => ({
    definition: module,
    name: module.name,
    root: joinSource(sourceRoot, module.name),
  }));
}

function resolveLayers(
  definition: ArchitectureDef,
  sourceRoot: string,
  moduleFirst: boolean,
): ResolvedLayer[] {
  return definition.layers.map((layer, index) => ({
    definition: layer,
    name: layer.name,
    root: moduleFirst ? null : joinSource(sourceRoot, layer.name),
    unit: getUnitShape(definition, layer.name),
    allowedImporters: resolveAllowedImporters(definition.layers, layer, index),
  }));
}

function resolveAllowedImporters(
  layers: LayerDef[],
  layer: LayerDef,
  index: number,
): AllowedImporter[] {
  return layer.allowedImporters === undefined
    ? layers.slice(0, index).map((candidate) => ({ layer: candidate.name }))
    : normalizeAllowedImporters(layer.allowedImporters);
}

function makeRelativeParts(state: ResolverState) {
  return (file: string | string[]): string[] => {
    const parts = Array.isArray(file) ? [...file] : segments(file);

    return startsWith(parts, state.sourceSegments)
      ? parts.slice(state.sourceSegments.length)
      : parts;
  };
}

function makeClassifier(
  state: ResolverState,
  relativeParts: (file: string | string[]) => string[],
) {
  return (
    file: string | string[],
    context: ResolveArchitectureContext = {},
  ): ResolvedPosition => {
    const path = relativeParts(file);

    if (!path.length) {
      return position('source-root', path);
    }

    return state.moduleFirst
      ? classifyModuleFirst(state, path, context)
      : classifyLayerFirst(state, path);
  };
}

function classifyLayerFirst(state: ResolverState, path: string[]): ResolvedPosition {
  const layer = state.layerByName.get(path[0]) ?? null;

  if (!layer) {
    return position('source-root', path);
  }

  if (path.length === 1) {
    return position('layer', path, { layer, inner: 'layer' });
  }

  return position('unit', path, {
    layer,
    unit: unitName(path.slice(1)),
    inner: 'layer',
  });
}

function classifyModuleFirst(
  state: ResolverState,
  path: string[],
  context: ResolveArchitectureContext,
): ResolvedPosition {
  const module = state.moduleByName.get(path[0]) ?? null;

  if (!module) {
    return looksLikeFile(path[0])
      ? position('source-root', path)
      : position('undeclared-module', path);
  }

  if (path.length === 1) {
    return position('module', path, { module });
  }

  return classifyInsideModule({ state, module, path, context });
}

function classifyInsideModule(input: {
  state: ResolverState;
  module: ResolvedModule;
  path: string[];
  context: ResolveArchitectureContext;
}): ResolvedPosition {
  const { state, module, path, context } = input;
  const inside = path.slice(1);
  const layer = state.layerByName.get(inside[0]) ?? null;

  if (layer) {
    return classifyModuleLayer(module, layer, { path, inside });
  }

  if (isContainerSource(module, inside, context)) {
    return position('container', path, { module, inner: 'container' });
  }

  return position('module', path, { module });
}

function classifyModuleLayer(
  module: ResolvedModule,
  layer: ResolvedLayer,
  location: { path: string[]; inside: string[] },
): ResolvedPosition {
  const { path, inside } = location;

  if (inside.length === 1) {
    return position('layer', path, { module, layer, inner: 'layer' });
  }

  return position('unit', path, {
    module,
    layer,
    unit: unitName(inside.slice(1)),
    inner: 'layer',
  });
}

function isContainerSource(
  module: ResolvedModule,
  inside: string[],
  context: ResolveArchitectureContext,
): boolean {
  return context.nextAppRouterModules?.includes(module.name) === true
    || (inside.length === 1 && looksLikeFile(inside[0]));
}

function makeCanImport(state: ResolverState) {
  return (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return state.layerByName.get(to)?.allowedImporters
      .some((entry) => entry.layer === from) ?? false;
  };
}

function assembleResolved(context: {
  state: ResolverState;
  relativeParts: (file: string | string[]) => string[];
  classify: ResolvedArchitecture['classify'];
  canImport: ResolvedArchitecture['canImport'];
}): ResolvedArchitecture {
  const { state, relativeParts, classify, canImport } = context;
  const resolved = baseResolved(state, classify, canImport);

  return {
    ...resolved,
    ...createPathMethods({ state, relativeParts, classify, canImport }),
  };
}

function baseResolved(
  state: ResolverState,
  classify: ResolvedArchitecture['classify'],
  canImport: ResolvedArchitecture['canImport'],
): Omit<ResolvedArchitecture,
  | 'resolveModuleRoot'
  | 'resolveLayerRoot'
  | 'resolveModuleLayerRoot'
  | 'layerFiles'
  | 'moduleLayerFiles'
  | 'resolveImportPosition'
  | 'resolveImportTarget'
  | 'forbiddenLayers'
  | 'selfOnlyTargets'
  | 'aliasSpecifiers'> {
  const { definition, sourceRoot, moduleFirst, modules, layers, aliases } = state;

  return {
    definition,
    sourceRoot,
    moduleFirst,
    modules,
    moduleNames: modules.map((module) => module.name),
    layers,
    layerNames: layers.map((layer) => layer.name),
    aliases,
    aliasMappings: [
      [definition.alias, sourceRoot],
      ...Object.entries(definition.additionalAliases ?? {}),
    ],
    ownership: layers.filter((layer) => layer.definition.owns?.length),
    diagramEdges: resolveDiagramEdges(layers),
    hasSelfOnly: layers.some((layer) =>
      layer.allowedImporters.some((importer) => importer.selfOnly === true)),
    matchModule(file) {
      return classify(file).module;
    },
    matchLayer(file) {
      return classify(file).layer;
    },
    classify,
    canImport,
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

    return index === 0
      ? []
      : [{ from: layers[index - 1].name, to: layer.name, ordered: true }];
  });
}

function position(
  kind: ResolvedPositionKind,
  path: string[],
  identity: PositionIdentity = {},
): ResolvedPosition {
  return {
    kind,
    path,
    module: identity.module ?? null,
    layer: identity.layer ?? null,
    unit: identity.unit ?? null,
    inner: identity.inner ?? null,
  };
}

function unitName(path: string[]): string | null {
  return path[0] ? stripExtension(path[0]) : null;
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}

function looksLikeFile(value: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(value);
}

function joinSource(sourceRoot: string, ...parts: string[]): string {
  return [sourceRoot === '.' ? '' : sourceRoot, ...parts].filter(Boolean).join('/');
}

function segments(value: string): string[] {
  return value.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
}
