import type { AllowedImporter, ArchitectureDef, LayerDef } from './types';

/** A directed edge (`from` imports `to`) for the Explain diagram. */
export interface DiagramEdge {
  from: string;
  to: string;
  selfOnly?: boolean;
  description?: string;
}

/**
 * Normalize the mixed `allowedImporters` list into objects.
 * @internal
 */
export function normalizeAllowedImporters(
  allowed: (string | AllowedImporter)[] | undefined,
): AllowedImporter[] {
  return (allowed ?? []).map((entry) =>
    typeof entry === 'string' ? { layer: entry } : entry,
  );
}

/**
 * Names of layers permitted to import the layer at `index`: its explicit
 * `allowedImporters` list, or — by default — every layer declared before it.
 */
function importerNames(layers: LayerDef[], index: number): string[] {
  const { allowedImporters } = layers[index];

  return allowedImporters
    ? normalizeAllowedImporters(allowedImporters).map((importer) => importer.layer)
    : layers.slice(0, index).map((layer) => layer.name);
}

/**
 * Layers `layerName` may NOT import: every other layer that does not list
 * `layerName` among its permitted importers (upstream layers included).
 * @internal
 */
export function getForbiddenLayers(architecture: ArchitectureDef, layerName: string): string[] {
  const { layers } = architecture;

  return layers
    .filter(
      (layer, index) =>
        layer.name !== layerName && !importerNames(layers, index).includes(layerName),
    )
    .map((layer) => layer.name);
}

/**
 * The effective module shape for a layer: its override, else the shared default.
 * @internal
 */
export function getModuleShape(
  architecture: ArchitectureDef,
  layerName: string,
): { layout: 'folder' | 'flat'; entry: string } {
  const layer = architecture.layers.find((candidate) => candidate.name === layerName);

  return {
    layout: layer?.module?.layout ?? architecture.module.layout,
    entry: layer?.module?.entry ?? architecture.module.entry,
  };
}

/**
 * Layers `layerName` may import but must not re-export (selfOnly importers).
 * @internal
 */
export function getSelfOnlyTargets(architecture: ArchitectureDef, layerName: string): string[] {
  return architecture.layers
    .filter((layer) =>
      normalizeAllowedImporters(layer.allowedImporters).some(
        (importer) => importer.layer === layerName && importer.selfOnly,
      ),
    )
    .map((layer) => layer.name);
}

/**
 * Edges for the dependency diagram: the adjacent spine for default layers,
 * and each explicit importer edge for layers that restrict their importers.
 * @internal
 */
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
      edges.push({ from: layers[index - 1].name, to: layer.name });
    }
  });

  return edges;
}
