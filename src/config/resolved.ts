import type {
  AllowedImporter,
  ArchitectureDef,
  Framework,
  LayerDef,
  ModuleDef,
} from './types';
import {
  aliasLayerRoots,
  aliasSpecifier,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';

export interface ResolvedLayer {
  definition: LayerDef;
  name: string;
  /** Layer-first root, or a `{module}` address template under module-first topology. */
  root: string;
  unit: { layout: 'folder' | 'file'; entry: string };
  /** Compatibility shape for internal 3.x consumers while they migrate to `unit`. */
  module: { layout: 'folder' | 'flat'; entry: string };
  allowedImporters: AllowedImporter[];
}

export interface ResolvedModule {
  definition: ModuleDef;
  name: string;
  root: string;
}

export type PositionKind
  = | 'source-root'
    | 'undeclared-module'
    | 'module'
    | 'container'
    | 'layer'
    | 'unit';

export interface ResolvedPosition {
  kind: PositionKind;
  module: ResolvedModule | null;
  layer: ResolvedLayer | null;
  unit: string | null;
  /** Path relative to the configured source root, using POSIX-style segments. */
  relative: string[];
  /** Undeclared source-root folder name when `kind === 'undeclared-module'`. */
  undeclaredModule?: string;
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
  /** Compatibility default for internal 3.x consumers. New code reads `layer.unit`. */
  folderShape: { layout: 'folder' | 'flat'; entry: string; private: string[] };
  diagramEdges: DiagramEdge[];
  hasSelfOnly: boolean;
  classify(file: string | string[]): ResolvedPosition;
  matchModule(file: string | string[]): ResolvedModule | null;
  matchLayer(file: string | string[]): ResolvedLayer | null;
  resolveModuleRoot(module: string): string | null;
  resolveLayerRoot(layer: string, module?: string): string | null;
  layerFiles(layer: string, framework: Framework): string[];
  moduleLayerFiles(module: string, layer: string, framework: Framework): string[];
  resolveImportPosition(importer: string | string[], specifier: string): ResolvedPosition | null;
  resolveImportTarget(importer: string | string[], specifier: string): ResolvedLayer | null;
  canImport(from: string, to: string): boolean;
  forbiddenLayers(layer: string): string[];
  selfOnlyTargets(layer: string): string[];
  aliasSpecifiers(layer: string, module?: string): string[];
}

interface PositionContext {
  moduleFirst: boolean;
  modulesByName: Map<string, ResolvedModule>;
  layersByName: Map<string, ResolvedLayer>;
  relative: string[];
}

interface PositionInput {
  kind: PositionKind;
  relative: string[];
  module?: ResolvedModule | null;
  layer?: ResolvedLayer | null;
  unit?: string | null;
}

export function resolveArchitecture(definition: ArchitectureDef): ResolvedArchitecture {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const sourceSegments = segments(sourceRoot);
  const aliases = aliasLayerRoots(definition);
  const moduleFirst = definition.modules !== undefined;
  const modules = buildModules(definition, sourceRoot);
  const modulesByName = new Map(modules.map((module) => [module.name, module]));
  const layers = buildLayers(definition, sourceRoot, moduleFirst);
  const layersByName = new Map(layers.map((layer) => [layer.name, layer]));
  const relativeParts = createRelativeParts(sourceSegments);
  const classify = (file: string | string[]) => classifyPosition({
    moduleFirst,
    modulesByName,
    layersByName,
    relative: relativeParts(file),
  });
  const canImport = createCanImport(layersByName);
  const resolved = createResolvedArchitecture({
    definition,
    sourceRoot,
    aliases,
    modules,
    layers,
    modulesByName,
    layersByName,
    moduleFirst,
    relativeParts,
    classify,
    canImport,
  });

  return resolved;
}

function buildModules(definition: ArchitectureDef, sourceRoot: string): ResolvedModule[] {
  return (definition.modules ?? []).map((module) => ({
    definition: module,
    name: module.name,
    root: joinSource(sourceRoot, module.name),
  }));
}

function buildLayers(
  definition: ArchitectureDef,
  sourceRoot: string,
  moduleFirst: boolean,
): ResolvedLayer[] {
  return definition.layers.map((layer, index) => {
    const unit = getUnitShape(definition, layer.name);

    return {
      definition: layer,
      name: layer.name,
      root: moduleFirst
        ? joinSource(sourceRoot, `{module}/${layer.name}`)
        : joinSource(sourceRoot, layer.name),
      unit,
      module: { layout: unit.layout === 'folder' ? 'folder' : 'flat', entry: unit.entry },
      allowedImporters: layer.allowedImporters === undefined
        ? definition.layers.slice(0, index).map((candidate) => ({ layer: candidate.name }))
        : normalizeAllowedImporters(layer.allowedImporters),
    };
  });
}

function createRelativeParts(sourceSegments: string[]) {
  return (file: string | string[]): string[] => {
    const parts = Array.isArray(file) ? file : segments(file);

    return startsWith(parts, sourceSegments) ? parts.slice(sourceSegments.length) : parts;
  };
}

function createCanImport(layersByName: Map<string, ResolvedLayer>) {
  return (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return layersByName.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
  };
}

function createResolvedArchitecture(context: {
  definition: ArchitectureDef;
  sourceRoot: string;
  aliases: AliasRoot[];
  modules: ResolvedModule[];
  layers: ResolvedLayer[];
  modulesByName: Map<string, ResolvedModule>;
  layersByName: Map<string, ResolvedLayer>;
  moduleFirst: boolean;
  relativeParts: (file: string | string[]) => string[];
  classify: (file: string | string[]) => ResolvedPosition;
  canImport: (from: string, to: string) => boolean;
}): ResolvedArchitecture {
  const {
    definition,
    sourceRoot,
    aliases,
    modules,
    layers,
    modulesByName,
    layersByName,
    moduleFirst,
    relativeParts,
    classify,
    canImport,
  } = context;
  const resolved = {} as ResolvedArchitecture;

  Object.assign(resolved, {
    definition,
    sourceRoot,
    moduleFirst,
    modules,
    moduleNames: modules.map((module) => module.name),
    layers,
    layerNames: layers.map((layer) => layer.name),
    aliases,
    aliasMappings: [[definition.alias, sourceRoot], ...Object.entries(definition.additionalAliases ?? {})],
    ownership: layers.filter((layer) => layer.definition.owns?.length),
    folderShape: { layout: 'flat', entry: 'index', private: [] },
    diagramEdges: buildDiagramEdges(layers),
    hasSelfOnly: layers.some((layer) =>
      layer.allowedImporters.some((importer) => importer.selfOnly === true)),
    classify,
  });

  attachPathResolvers(resolved, {
    definition,
    sourceRoot,
    aliases,
    modules,
    modulesByName,
    layers,
    layersByName,
    moduleFirst,
    relativeParts,
    classify,
    canImport,
  });

  return resolved;
}

function buildDiagramEdges(layers: ResolvedLayer[]): DiagramEdge[] {
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

function attachPathResolvers(
  resolved: ResolvedArchitecture,
  context: {
    definition: ArchitectureDef;
    sourceRoot: string;
    aliases: AliasRoot[];
    modules: ResolvedModule[];
    modulesByName: Map<string, ResolvedModule>;
    layers: ResolvedLayer[];
    layersByName: Map<string, ResolvedLayer>;
    moduleFirst: boolean;
    relativeParts: (file: string | string[]) => string[];
    classify: (file: string | string[]) => ResolvedPosition;
    canImport: (from: string, to: string) => boolean;
  },
): void {
  const {
    definition,
    sourceRoot,
    aliases,
    modules,
    modulesByName,
    layers,
    layersByName,
    moduleFirst,
    relativeParts,
    classify,
    canImport,
  } = context;

  resolved.matchModule = (file) => classify(file).module;
  resolved.matchLayer = (file) => classify(file).layer;
  resolved.resolveModuleRoot = (module) => modulesByName.get(module)?.root ?? null;
  resolved.resolveLayerRoot = (layer, module) => resolveLayerRoot({
    sourceRoot,
    moduleFirst,
    modulesByName,
    layersByName,
  }, layer, module);
  resolved.moduleLayerFiles = (module, layer, framework) => moduleLayerFiles({
    definition,
    sourceRoot,
    moduleFirst,
    modulesByName,
    layersByName,
  }, module, layer, framework);
  resolved.layerFiles = (layer, framework) => moduleFirst
    ? modules.flatMap((module) => resolved.moduleLayerFiles(module.name, layer, framework))
    : layerFirstFiles(definition, sourceRoot, layersByName, layer, framework);
  resolved.resolveImportPosition = (importer, specifier) => resolveImportPosition(
    { aliases, classify, relativeParts },
    importer,
    specifier,
  );
  resolved.resolveImportTarget = (importer, specifier) =>
    resolved.resolveImportPosition(importer, specifier)?.layer ?? null;
  resolved.canImport = canImport;
  resolved.forbiddenLayers = (layer) => layers
    .filter((target) => target.name !== layer && !canImport(layer, target.name))
    .map((target) => target.name);
  resolved.selfOnlyTargets = (layer) => layers.filter((target) => target.allowedImporters
    .some((importer) => importer.layer === layer && importer.selfOnly))
    .map((target) => target.name);
  resolved.aliasSpecifiers = (layer, module) => aliases
    .flatMap((root) => aliasSpecifier(root, layer, module) ?? []);
}

function resolveLayerRoot(
  context: {
    sourceRoot: string;
    moduleFirst: boolean;
    modulesByName: Map<string, ResolvedModule>;
    layersByName: Map<string, ResolvedLayer>;
  },
  layer: string,
  module?: string,
): string | null {
  if (!context.layersByName.has(layer)) {
    return null;
  }

  if (!context.moduleFirst) {
    return joinSource(context.sourceRoot, layer);
  }

  if (module === undefined || !context.modulesByName.has(module)) {
    return null;
  }

  return joinSource(context.sourceRoot, `${module}/${layer}`);
}

function layerFirstFiles(
  definition: ArchitectureDef,
  sourceRoot: string,
  layersByName: Map<string, ResolvedLayer>,
  layer: string,
  framework: Framework,
): string[] {
  if (!layersByName.has(layer)) {
    return [];
  }

  return resolveLayerFilePatterns(layer, framework, {
    layerFiles: definition.layerFiles,
    layerRoot: joinSource(sourceRoot, layer),
    sourceRoot,
  });
}

function moduleLayerFiles(
  context: {
    definition: ArchitectureDef;
    sourceRoot: string;
    moduleFirst: boolean;
    modulesByName: Map<string, ResolvedModule>;
    layersByName: Map<string, ResolvedLayer>;
  },
  module: string,
  layer: string,
  framework: Framework,
): string[] {
  if (!context.moduleFirst
    || !context.modulesByName.has(module)
    || !context.layersByName.has(layer)) {
    return [];
  }

  return resolveLayerFilePatterns(layer, framework, {
    layerFiles: context.definition.layerFiles,
    layerRoot: joinSource(context.sourceRoot, `${module}/${layer}`),
    sourceRoot: context.sourceRoot,
    module,
  });
}

function classifyPosition(context: PositionContext): ResolvedPosition {
  if (!context.relative.length) {
    return position({ kind: 'source-root', relative: context.relative });
  }

  return context.moduleFirst ? classifyModuleFirst(context) : classifyLayerFirst(context);
}

function classifyLayerFirst(context: PositionContext): ResolvedPosition {
  const layer = context.layersByName.get(context.relative[0]) ?? null;

  return layer
    ? classifyLayerPosition({ relative: context.relative, module: null, layer, layerDepth: 1 })
    : position({ kind: 'source-root', relative: context.relative });
}

function classifyModuleFirst(context: PositionContext): ResolvedPosition {
  const module = context.modulesByName.get(context.relative[0]) ?? null;

  if (!module) {
    return undeclaredOrWiring(context.relative);
  }

  if (context.relative.length === 1) {
    return position({ kind: 'module', relative: context.relative, module });
  }

  const layer = context.layersByName.get(context.relative[1]) ?? null;

  return layer
    ? classifyLayerPosition({ relative: context.relative, module, layer, layerDepth: 2 })
    : position({ kind: 'container', relative: context.relative, module });
}

function undeclaredOrWiring(relative: string[]): ResolvedPosition {
  const top = relative[0];
  const looksLikeRootFile = relative.length === 1 && /\.[A-Za-z0-9]+$/.test(top);

  return looksLikeRootFile
    ? position({ kind: 'source-root', relative })
    : { ...position({ kind: 'undeclared-module', relative }), undeclaredModule: top };
}

function classifyLayerPosition(input: {
  relative: string[];
  module: ResolvedModule | null;
  layer: ResolvedLayer;
  layerDepth: number;
}): ResolvedPosition {
  const { relative, module, layer, layerDepth } = input;

  if (relative.length <= layerDepth) {
    return position({ kind: 'layer', relative, module, layer });
  }

  const value = relative[layerDepth];
  const unit = layer.unit.layout === 'file' ? stripExtension(value) : value;

  return position({ kind: 'unit', relative, module, layer, unit });
}

function position(input: PositionInput): ResolvedPosition {
  return {
    kind: input.kind,
    module: input.module ?? null,
    layer: input.layer ?? null,
    unit: input.unit ?? null,
    relative: input.relative,
  };
}

function stripExtension(value: string): string {
  const last = value.lastIndexOf('.');

  return last > 0 ? value.slice(0, last) : value;
}

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

export function resolveLayerFilePatterns(
  layer: string,
  framework: Framework,
  scope: {
    layerFiles?: string | string[];
    layerRoot?: string;
    sourceRoot?: string;
    module?: string;
  } = {},
): string[] {
  const sourceRoot = scope.sourceRoot ?? 'src';
  const declared = scope.layerFiles === undefined
    ? [`${scope.layerRoot ?? joinSource(sourceRoot, '{layer}')}/**/*.{${FRAMEWORK_EXTS[framework]}}`]
    : toArray(scope.layerFiles);

  return declared.map((glob) => glob
    .replace(/\{\s*module\s*\}/g, () => scope.module ?? '{module}')
    .replace(/\{\s*layer\s*\}/g, () => layer));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function resolveImportPosition(
  context: {
    aliases: AliasRoot[];
    classify: (file: string | string[]) => ResolvedPosition;
    relativeParts: (file: string | string[]) => string[];
  },
  importer: string | string[],
  specifier: string,
): ResolvedPosition | null {
  const importerPosition = context.classify(importer);

  if (['source-root', 'undeclared-module'].includes(importerPosition.kind)) {
    return null;
  }

  const aliasTarget = resolveAliasTarget(context.aliases, specifier);

  if (aliasTarget !== undefined) {
    return aliasTarget === null ? null : context.classify(aliasTarget);
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const target = resolveRelative(context.relativeParts(importer).slice(0, -1), specifier);

  return target ? context.classify(target) : null;
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

function joinSource(sourceRoot: string, child: string): string {
  return sourceRoot === '.' ? child : `${sourceRoot}/${child}`;
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