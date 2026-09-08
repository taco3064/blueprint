import type { AllowedImporter, ArchitectureDef, Framework, LayerDef, ModuleDef } from './types';
import {
  aliasLayerRoots,
  aliasSpecifier,
  getModuleShape,
  getSharedModule,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';

export interface ResolvedLayer {
  definition: LayerDef;
  name: string;
  root: string;
  module: { layout: 'folder' | 'flat'; entry: string };
  allowedImporters: AllowedImporter[];
}

export interface ResolvedArchitecture {
  definition: ArchitectureDef;
  sourceRoot: string;
  layers: ResolvedLayer[];
  layerNames: string[];
  aliases: AliasRoot[];
  aliasMappings: [string, string][];
  ownership: ResolvedLayer[];
  folderShape: Required<ModuleDef>;
  diagramEdges: DiagramEdge[];
  hasSelfOnly: boolean;
  matchLayer(file: string | string[]): ResolvedLayer | null;
  resolveLayerRoot(layer: string): string | null;
  layerFiles(layer: string, framework: Framework): string[];
  resolveImportTarget(importer: string | string[], specifier: string): ResolvedLayer | null;
  canImport(from: string, to: string): boolean;
  forbiddenLayers(layer: string): string[];
  selfOnlyTargets(layer: string): string[];
  aliasSpecifiers(layer: string): string[];
}

export function resolveArchitecture(definition: ArchitectureDef): ResolvedArchitecture {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const sourceSegments = segments(sourceRoot);
  const aliases = aliasLayerRoots(definition);

  const layers: ResolvedLayer[] = definition.layers.map((layer) => ({
    definition: layer,
    name: layer.name,
    root: joinSource(sourceRoot, layer.name),
    module: getModuleShape(definition, layer.name),
    allowedImporters: layer.allowedImporters === undefined
      ? definition.layers
          .slice(0, definition.layers.indexOf(layer))
          .map((candidate) => ({ layer: candidate.name }))
      : normalizeAllowedImporters(layer.allowedImporters),
  }));

  const byName = new Map(layers.map((layer) => [layer.name, layer]));

  const matchLayer = (file: string | string[]): ResolvedLayer | null => {
    const parts = Array.isArray(file) ? file : segments(file);

    const relative = startsWith(parts, sourceSegments)
      ? parts.slice(sourceSegments.length)
      : parts;

    return byName.get(relative[0]) ?? null;
  };

  const canImport = (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return byName.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
  };

  const resolved: ResolvedArchitecture = {
    definition,
    sourceRoot,
    layers,
    layerNames: layers.map((layer) => layer.name),
    aliases,
    aliasMappings: [
      [definition.alias, sourceRoot],
      ...Object.entries(definition.additionalAliases ?? {}),
    ],
    ownership: layers.filter((layer) => layer.definition.owns?.length),
    folderShape: getSharedModule(definition),
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
    matchLayer,
    resolveLayerRoot(layer) {
      return byName.get(layer)?.root ?? null;
    },
    layerFiles(layer, framework) {
      return resolveLayerFilePatterns(layer, framework, {
        layerFiles: definition.layerFiles,
        layerRoot: resolved.resolveLayerRoot(layer) ?? joinSource(sourceRoot, layer),
        sourceRoot,
      });
    },
    resolveImportTarget(importer, specifier) {
      return resolveImportTarget(
        { aliases, byName, matchLayer, sourceSegments },
        importer,
        specifier,
      );
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
    aliasSpecifiers(layer) {
      return aliases.flatMap((root) => aliasSpecifier(root, layer) ?? []);
    },
  };

  return resolved;
}

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

export function resolveLayerFilePatterns(
  layer: string,
  framework: Framework,
  scope: { layerFiles?: string | string[]; layerRoot?: string; sourceRoot?: string } = {},
): string[] {
  const sourceRoot = scope.sourceRoot ?? 'src';

  const declared = scope.layerFiles === undefined
    ? [`${scope.layerRoot ?? joinSource(sourceRoot, '{layer}')}/**/*.{${FRAMEWORK_EXTS[framework]}}`]
    : toArray(scope.layerFiles);

  return declared.map((glob) => glob.replace(/\{\s*layer\s*\}/g, () => layer));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function resolveImportTarget(
  context: {
    aliases: AliasRoot[];
    byName: Map<string, ResolvedLayer>;
    matchLayer: (file: string | string[]) => ResolvedLayer | null;
    sourceSegments: string[];
  },
  importer: string | string[],
  specifier: string,
): ResolvedLayer | null {
  const { aliases, byName, matchLayer, sourceSegments } = context;

  const importerLayer = typeof importer === 'string'
    ? byName.get(importer) ?? matchLayer(importer)
    : matchLayer(importer);

  if (!importerLayer) {
    return null;
  }

  const aliasTarget = resolveAliasTarget(aliases, specifier);

  if (aliasTarget !== undefined) {
    return aliasTarget === null ? null : byName.get(aliasTarget) ?? null;
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const importerParts = Array.isArray(importer) ? importer : segments(importer);

  const relative = startsWith(importerParts, sourceSegments)
    ? importerParts.slice(sourceSegments.length)
    : importerParts;

  const target = resolveRelative(relative.slice(0, -1), specifier);

  return target ? byName.get(target[0]) ?? null : null;
}

function resolveAliasTarget(aliases: AliasRoot[], specifier: string): string | null | undefined {
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

  return [...(root.prepend ?? []), ...parts.slice(root.prefix.length)][0] ?? null;
}

function joinSource(sourceRoot: string, layer: string): string {
  return sourceRoot === '.' ? layer : `${sourceRoot}/${layer}`;
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
