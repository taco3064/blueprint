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
 * How many segments sit above the layer: 0 in a flat project, 1 under
 * `modules`, where `src/<Module>/<layer>/<unit>` puts the module first.
 *
 * Derived here and nowhere else. Recomputed at a call site it becomes a second
 * source of truth for the one fact that decides what every segment position
 * means, and the two readers of `relativeVerdict` could then disagree about
 * which segment is the layer — the disagreement the shared function exists to
 * make inexpressible.
 */
export function moduleDepth(architecture: ArchitectureDef): number {
  return architecture.modules === undefined ? 0 : 1;
}

/** One module shape a layer can declare. */
export interface ModuleShape {
  layout: 'folder' | 'flat';
  entry: string;
}

/**
 * The shape a layer that declares neither key resolves to — the playbook's
 * "flat default" made real (field issue #23: `architecture.module` validated
 * as required while the playbook said omitting it was the default).
 * @internal
 */
export const DEFAULT_MODULE_SHAPE: ModuleShape = { layout: 'flat', entry: 'index' };

/**
 * The effective module shape for a layer: what it declares, else the default.
 * @internal
 */
export function getModuleShape(architecture: ArchitectureDef, layerName: string): ModuleShape {
  const layer = architecture.layers.find((candidate) => candidate.name === layerName);

  return {
    layout: layer?.layout ?? DEFAULT_MODULE_SHAPE.layout,
    entry: layer?.entry ?? DEFAULT_MODULE_SHAPE.entry,
  };
}

/** A module shape, with the layers that resolve to it. */
export interface ModuleShapeGroup extends ModuleShape {
  /** Layers sharing this shape, in declaration order. */
  layers: string[];
}

/**
 * The distinct module shapes across the layers, first-declared first. Every
 * document that states the shape renders from this: there is no project-wide
 * shape to state, so a single group is stated once and several are stated one
 * by one, naming their layers. A flat layer keys on layout alone — its entry
 * filename is not a fact about it, so two flat layers never split a group.
 * @internal
 */
export function moduleShapeGroups(architecture: ArchitectureDef): ModuleShapeGroup[] {
  const groups = new Map<string, ModuleShapeGroup>();

  for (const layer of architecture.layers) {
    const shape = getModuleShape(architecture, layer.name);
    const key = shape.layout === 'folder' ? `folder:${shape.entry}` : 'flat';
    const group = groups.get(key);

    if (group) {
      group.layers.push(layer.name);
    } else {
      groups.set(key, { ...shape, layers: [layer.name] });
    }
  }

  return [...groups.values()];
}

/**
 * The distinct entry filenames of the folder layers, first-declared first.
 * Empty when no layer is a folder — which is the state that has no entry to
 * name, rather than one whose name defaults.
 * @internal
 */
export function folderEntries(architecture: ArchitectureDef): string[] {
  return moduleShapeGroups(architecture)
    .filter((group) => group.layout === 'folder')
    .map((group) => group.entry);
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
