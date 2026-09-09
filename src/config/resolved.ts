import type { AllowedImporter, ArchitectureDef, Framework, LayerDef, ModuleDef } from './types';
import {
  aliasLayerRoots,
  aliasPathSpecifier,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';

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

  const layers: ResolvedLayer[] = definition.layers.map((layer) => ({
    definition: layer,
    name: layer.name,
    root: moduleFirst ? null : joinSource(sourceRoot, layer.name),
    unit: getUnitShape(definition, layer.name),
    allowedImporters: layer.allowedImporters === undefined
      ? definition.layers
          .slice(0, definition.layers.indexOf(layer))
          .map((candidate) => ({ layer: candidate.name }))
      : normalizeAllowedImporters(layer.allowedImporters),
  }));

  const moduleByName = new Map(modules.map((module) => [module.name, module]));
  const layerByName = new Map(layers.map((layer) => [layer.name, layer]));

  const relativeParts = (file: string | string[]): string[] => {
    const parts = Array.isArray(file) ? [...file] : segments(file);

    return startsWith(parts, sourceSegments) ? parts.slice(sourceSegments.length) : parts;
  };

  const classify = (
    file: string | string[],
    context: ResolveArchitectureContext = {},
  ): ResolvedPosition => {
    const path = relativeParts(file);

    if (!path.length) {
      return position('source-root', path);
    }

    if (!moduleFirst) {
      const layer = layerByName.get(path[0]) ?? null;

      if (!layer) {
        return position('source-root', path);
      }

      if (path.length === 1) {
        return position('layer', path, null, layer, null, 'layer');
      }

      return position(
        'unit',
        path,
        null,
        layer,
        unitName(layer.unit, path.slice(1)),
        'layer',
      );
    }

    const module = moduleByName.get(path[0]) ?? null;

    if (!module) {
      return looksLikeFile(path[0])
        ? position('source-root', path)
        : position('undeclared-module', path);
    }

    if (path.length === 1) {
      return position('module', path, module);
    }

    const inside = path.slice(1);
    const layer = layerByName.get(inside[0]) ?? null;

    if (layer) {
      if (inside.length === 1) {
        return position('layer', path, module, layer, null, 'layer');
      }

      return position(
        'unit',
        path,
        module,
        layer,
        unitName(layer.unit, inside.slice(1)),
        'layer',
      );
    }

    if (context.nextAppRouterModules?.includes(module.name)) {
      return position('container', path, module, null, null, 'container');
    }

    if (inside.length === 1 && looksLikeFile(inside[0])) {
      return position('container', path, module, null, null, 'container');
    }

    return position('module', path, module);
  };

  const canImport = (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return layerByName.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
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
    matchModule(file) {
      return classify(file).module;
    },
    matchLayer(file) {
      return classify(file).layer;
    },
    classify,
    resolveModuleRoot(module) {
      return moduleByName.get(module)?.root ?? null;
    },
    resolveLayerRoot(layer) {
      return moduleFirst ? null : layerByName.get(layer)?.root ?? null;
    },
    resolveModuleLayerRoot(module, layer) {
      if (!moduleFirst || !moduleByName.has(module) || !layerByName.has(layer)) {
        return null;
      }

      return joinSource(sourceRoot, module, layer);
    },
    layerFiles(layer, framework) {
      if (!moduleFirst) {
        return resolveLayerFilePatterns(layer, framework, {
          layerFiles: definition.layerFiles,
          layerRoot: layerByName.get(layer)?.root ?? joinSource(sourceRoot, layer),
          sourceRoot,
        });
      }

      return modules.flatMap((module) => resolved.moduleLayerFiles(module.name, layer, framework));
    },
    moduleLayerFiles(module, layer, framework) {
      const root = resolved.resolveModuleLayerRoot(module, layer);

      if (root === null) {
        return [];
      }

      return resolveLayerFilePatterns(layer, framework, {
        layerFiles: definition.layerFiles,
        layerRoot: root,
        sourceRoot,
        module,
      });
    },
    resolveImportPosition(importer, specifier, context) {
      const aliasTarget = resolveAliasPath(aliases, specifier);

      if (aliasTarget !== undefined) {
        return aliasTarget === null ? null : classify(aliasTarget, context);
      }

      if (!specifier.startsWith('.')) {
        return null;
      }

      const importerParts = relativeParts(importer);
      const target = resolveRelative(importerParts.slice(0, -1), specifier);

      return target ? classify(target, context) : null;
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
      if (moduleFirst && module === undefined) {
        return modules.flatMap((candidate) =>
          aliases.flatMap((root) => aliasPathSpecifier(root, [candidate.name, layer]) ?? []));
      }

      return aliases.flatMap((root) =>
        aliasPathSpecifier(root, module === undefined ? [layer] : [module, layer]) ?? []);
    },
  };

  return resolved;
}

function position(
  kind: ResolvedPositionKind,
  path: string[],
  module: ResolvedModule | null = null,
  layer: ResolvedLayer | null = null,
  unit: string | null = null,
  inner: ResolvedInnerPosition = null,
): ResolvedPosition {
  return { kind, path, module, layer, unit, inner };
}

function unitName(shape: ResolvedUnitShape, path: string[]): string | null {
  const first = path[0];

  if (!first) {
    return null;
  }

  return shape.layout === 'folder' ? stripExtension(first) : stripExtension(first);
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}

function looksLikeFile(value: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(value);
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

function resolveAliasPath(
  aliases: AliasRoot[],
  specifier: string,
): string[] | null | undefined {
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

function joinSource(sourceRoot: string, ...parts: string[]): string {
  return [sourceRoot === '.' ? '' : sourceRoot, ...parts].filter(Boolean).join('/');
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
