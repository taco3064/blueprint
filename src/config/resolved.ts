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

export function resolveArchitecture(definition: ArchitectureDef): ResolvedArchitecture {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const sourceSegments = segments(sourceRoot);
  const aliases = aliasLayerRoots(definition);
  const moduleFirst = definition.modules !== undefined;

  const modules: ResolvedModule[] = (definition.modules ?? []).map((module) => ({
    definition: module,
    name: module.name,
    root: joinSource(sourceRoot, module.name),
  }));
  const modulesByName = new Map(modules.map((module) => [module.name, module]));

  const layers: ResolvedLayer[] = definition.layers.map((layer, index) => {
    const unit = getUnitShape(definition, layer.name);

    return {
      definition: layer,
      name: layer.name,
      root: moduleFirst
        ? joinSource(sourceRoot, `{module}/${layer.name}`)
        : joinSource(sourceRoot, layer.name),
      unit,
      module: {
        layout: unit.layout === 'folder' ? 'folder' : 'flat',
        entry: unit.entry,
      },
      allowedImporters: layer.allowedImporters === undefined
        ? definition.layers.slice(0, index).map((candidate) => ({ layer: candidate.name }))
        : normalizeAllowedImporters(layer.allowedImporters),
    };
  });
  const layersByName = new Map(layers.map((layer) => [layer.name, layer]));

  const relativeParts = (file: string | string[]): string[] => {
    const parts = Array.isArray(file) ? file : segments(file);

    return startsWith(parts, sourceSegments) ? parts.slice(sourceSegments.length) : parts;
  };

  const classify = (file: string | string[]): ResolvedPosition => classifyPosition({
    moduleFirst,
    modulesByName,
    layersByName,
    relative: relativeParts(file),
  });

  const canImport = (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return layersByName.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
  };

  const resolved: ResolvedArchitecture = {
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
    folderShape: { layout: 'flat', entry: 'index', private: [] },
    diagramEdges: layers.flatMap((layer, index): DiagramEdge[] => {
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
    }),
    hasSelfOnly: layers.some((layer) =>
      layer.allowedImporters.some((importer) => importer.selfOnly === true)),
    classify,
    matchModule(file) {
      return classify(file).module;
    },
    matchLayer(file) {
      return classify(file).layer;
    },
    resolveModuleRoot(module) {
      return modulesByName.get(module)?.root ?? null;
    },
    resolveLayerRoot(layer, module) {
      if (!layersByName.has(layer)) {
        return null;
      }

      if (!moduleFirst) {
        return joinSource(sourceRoot, layer);
      }

      if (module === undefined || !modulesByName.has(module)) {
        return null;
      }

      return joinSource(sourceRoot, `${module}/${layer}`);
    },
    layerFiles(layer, framework) {
      if (!layersByName.has(layer)) {
        return [];
      }

      if (!moduleFirst) {
        return resolveLayerFilePatterns(layer, framework, {
          layerFiles: definition.layerFiles,
          layerRoot: joinSource(sourceRoot, layer),
          sourceRoot,
        });
      }

      return modules.flatMap((module) =>
        resolved.moduleLayerFiles(module.name, layer, framework));
    },
    moduleLayerFiles(module, layer, framework) {
      if (!moduleFirst || !modulesByName.has(module) || !layersByName.has(layer)) {
        return [];
      }

      return resolveLayerFilePatterns(layer, framework, {
        layerFiles: definition.layerFiles,
        layerRoot: joinSource(sourceRoot, `${module}/${layer}`),
        sourceRoot,
        module,
      });
    },
    resolveImportPosition(importer, specifier) {
      return resolveImportPosition(
        { aliases, classify, relativeParts },
        importer,
        specifier,
      );
    },
    resolveImportTarget(importer, specifier) {
      return resolved.resolveImportPosition(importer, specifier)?.layer ?? null;
    },
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
      return aliases.flatMap((root) => aliasSpecifier(root, layer, module) ?? []);
    },
  };

  return resolved;
}

function classifyPosition(context: {
  moduleFirst: boolean;
  modulesByName: Map<string, ResolvedModule>;
  layersByName: Map<string, ResolvedLayer>;
  relative: string[];
}): ResolvedPosition {
  const { moduleFirst, modulesByName, layersByName, relative } = context;

  if (!relative.length) {
    return position('source-root', relative);
  }

  if (!moduleFirst) {
    const layer = layersByName.get(relative[0]) ?? null;

    if (!layer) {
      return position('source-root', relative);
    }

    return classifyLayerPosition(relative, null, layer, 1);
  }

  const module = modulesByName.get(relative[0]) ?? null;

  if (!module) {
    const top = relative[0];
    const looksLikeRootFile = relative.length === 1 && /\.[A-Za-z0-9]+$/.test(top);

    return looksLikeRootFile
      ? position('source-root', relative)
      : { ...position('undeclared-module', relative), undeclaredModule: top };
  }

  if (relative.length === 1) {
    return position('module', relative, module);
  }

  const layer = layersByName.get(relative[1]) ?? null;

  if (!layer) {
    return position('container', relative, module);
  }

  return classifyLayerPosition(relative, module, layer, 2);
}

function classifyLayerPosition(
  relative: string[],
  module: ResolvedModule | null,
  layer: ResolvedLayer,
  layerDepth: number,
): ResolvedPosition {
  if (relative.length <= layerDepth) {
    return position('layer', relative, module, layer);
  }

  const value = relative[layerDepth];
  const unit = layer.unit.layout === 'file' ? stripExtension(value) : value;

  return position('unit', relative, module, layer, unit);
}

function position(
  kind: PositionKind,
  relative: string[],
  module: ResolvedModule | null = null,
  layer: ResolvedLayer | null = null,
  unit: string | null = null,
): ResolvedPosition {
  return { kind, module, layer, unit, relative };
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
  const { aliases, classify, relativeParts } = context;
  const importerPosition = classify(importer);

  if (importerPosition.kind === 'source-root' || importerPosition.kind === 'undeclared-module') {
    return null;
  }

  const aliasTarget = resolveAliasTarget(aliases, specifier);

  if (aliasTarget !== undefined) {
    return aliasTarget === null ? null : classify(aliasTarget);
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const target = resolveRelative(relativeParts(importer).slice(0, -1), specifier);

  return target ? classify(target) : null;
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