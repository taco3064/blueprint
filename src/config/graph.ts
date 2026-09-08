import type { AllowedImporter, ArchitectureDef, LayerDef } from './types';

/** A directed edge (`from` imports `to`) for the Explain diagram. */
export interface DiagramEdge {
  from: string;
  to: string;
  selfOnly?: boolean;
  description?: string;
  /**
   * True when the edge only records declaration order (the adjacent spine),
   * not a declared importer relation — consecutive leaf layers are often
   * semantically unrelated, and drawing them alike misreads as dependency.
   */
  ordered?: boolean;
}

export function normalizeAllowedImporters(
  allowed: (string | AllowedImporter)[] | undefined,
): AllowedImporter[] {
  return (allowed ?? []).map((entry) =>
    typeof entry === 'string' ? { layer: entry } : entry,
  );
}

function importerNames(layers: LayerDef[], index: number): string[] {
  const { allowedImporters } = layers[index];

  return allowedImporters
    ? normalizeAllowedImporters(allowedImporters).map((importer) => importer.layer)
    : layers.slice(0, index).map((layer) => layer.name);
}

export function getForbiddenLayers(architecture: ArchitectureDef, layerName: string): string[] {
  const { layers } = architecture;

  return layers
    .filter(
      (layer, index) =>
        layer.name !== layerName && !importerNames(layers, index).includes(layerName),
    )
    .map((layer) => layer.name);
}

/** An alias paired with the path segments between its target and the source root. */
export interface AliasRoot {
  alias: string;
  /** Segments to cross from the alias target down to the source root. */
  prefix: string[];
  /** Segments the alias target contributes below the source root. */
  prepend?: string[];
}

export function aliasLayerRoots(architecture: ArchitectureDef): AliasRoot[] {
  const sourceRoot = architecture.sourceRoot ?? 'src';

  return [
    { alias: architecture.alias, prefix: [] },
    ...Object.entries(architecture.additionalAliases ?? {}).flatMap(([alias, target]) =>
      aliasRoot(alias, target, sourceRoot) ?? []),
  ];
}

export function aliasRoot(alias: string, target: string, sourceRoot: string): AliasRoot | null {
  const src = dirSegments(sourceRoot);
  const segments = dirSegments(target);

  if (segments.every((segment, i) => src[i] === segment)) {
    return { alias, prefix: src.slice(segments.length) };
  }

  if (src.every((segment, i) => segments[i] === segment)) {
    return { alias, prefix: [], prepend: segments.slice(src.length) };
  }

  return null;
}

export function aliasSpecifier(
  root: AliasRoot | string,
  layer: string,
  module?: string,
): string | null {
  const path = module === undefined ? [layer] : [module, layer];

  if (typeof root === 'string') {
    return [root, ...path].join('/');
  }

  const prepend = root.prepend ?? [];

  if (prepend.length) {
    if (!prepend.every((segment, index) => path[index] === segment)) {
      return null;
    }

    return [root.alias, ...path.slice(prepend.length)].join('/');
  }

  return [root.alias, ...root.prefix, ...path].join('/');
}

function dirSegments(dir: string): string[] {
  return dir.split(/[\\/]/).filter((segment) => segment !== '' && segment !== '.');
}

/** Unit shape inside one layer. */
export function getUnitShape(
  architecture: ArchitectureDef,
  layerName: string,
): { layout: 'folder' | 'file'; entry: string } {
  const layer = architecture.layers.find((candidate) => candidate.name === layerName);

  return {
    layout: layer?.layout ?? 'file',
    entry: layer?.entry ?? 'index',
  };
}

export function getSelfOnlyTargets(architecture: ArchitectureDef, layerName: string): string[] {
  return architecture.layers
    .filter((layer) =>
      normalizeAllowedImporters(layer.allowedImporters).some(
        (importer) => importer.layer === layerName && importer.selfOnly,
      ),
    )
    .map((layer) => layer.name);
}

export function getDiagramEdges(architecture: ArchitectureDef): DiagramEdge[] {
  const { layers } = architecture;
  const edges: DiagramEdge[] = [];

  layers.forEach((layer, index) => {
    if (layer.allowedImporters) {
      for (const importer of normalizeAllowedImporters(layer.allowedImporters)) {
        edges.push({
          from: importer.layer,
          to: layer.name,
          selfOnly: importer.selfOnly,
          description: importer.description,
        });
      }
    } else if (index > 0) {
      edges.push({ from: layers[index - 1].name, to: layer.name, ordered: true });
    }
  });

  return edges;
}