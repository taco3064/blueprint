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

/** An alias paired with the path segments between its target and the layer folders. */
export interface AliasRoot {
  alias: string;
  /** Segments to cross from the alias target to reach the layers, e.g. `['src']`. */
  prefix: string[];
}

/**
 * Every alias that can reach the layer folders, with the offset baked in.
 * The main alias targets the source root by wiring convention (prefix
 * `[]`); an additional alias carries its declared target — `'~root': '.'`
 * reaches the layers through a `src` prefix, and one targeting a folder
 * that cannot contain them (a subfolder, an outside dir) is excluded.
 * Emit and inspect both derive from here, so the ban patterns and the
 * findings can never disagree (field issue #29: patterns composed as
 * `alias/layer` banned paths no real import ever used — a silent no-op).
 * @internal
 */
export function aliasLayerRoots(architecture: ArchitectureDef): AliasRoot[] {
  const src = dirSegments(architecture.sourceRoot ?? 'src');

  return [
    { alias: architecture.alias, prefix: [] },
    ...Object.entries(architecture.additionalAliases ?? {}).flatMap(([alias, target]) => {
      const segments = dirSegments(target);

      return segments.every((segment, i) => src[i] === segment)
        ? [{ alias, prefix: src.slice(segments.length) }]
        : [];
    }),
  ];
}

/** `./src/` → `['src']`; `.` → `[]`. `..` segments survive and never match. */
function dirSegments(dir: string): string[] {
  return dir.split('/').filter((segment) => segment !== '' && segment !== '.');
}

/**
 * The shared module shape with the flat defaults applied — the playbook's
 * "flat default" made real: `architecture.module` and each of its keys is
 * optional, resolving to `{ layout: 'flat', entry: 'index', private: [] }`
 * (field issue #23: it validated as required while the playbook said
 * omitting it was the default).
 * @internal
 */
export function getSharedModule(
  architecture: ArchitectureDef,
): { layout: 'folder' | 'flat'; entry: string; private: string[] } {
  return {
    layout: architecture.module?.layout ?? 'flat',
    entry: architecture.module?.entry ?? 'index',
    private: architecture.module?.private ?? [],
  };
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
  const shared = getSharedModule(architecture);

  return {
    layout: layer?.module?.layout ?? shared.layout,
    entry: layer?.module?.entry ?? shared.entry,
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
      edges.push({ from: layers[index - 1].name, to: layer.name, ordered: true });
    }
  });

  return edges;
}
