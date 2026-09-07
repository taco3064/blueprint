import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, getModuleShape } from '../config';
import { moduleKey, resolveSegments } from '../plugin';
import type { EntryOf, LayoutOf } from '../plugin';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * Module-resolution primitives shared by `analyze` (findings, cycles),
 * `deps` (blast radius), and the embedded `blueprint/relative-escape` lint
 * rule: specifier → module key, plus the module import graph itself.
 */

export type { EntryOf, LayoutOf, ModuleShape, RelativeVerdict } from '../plugin';
export { moduleKey, relativeVerdict, resolveSegments } from '../plugin';

/** Build a {@link LayoutOf} from the architecture's per-layer module shapes. */
export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  return (layer) => getModuleShape(architecture, layer).layout;
}

/** The layer-reaching aliases with their offsets — see {@link aliasLayerRoots}. */
export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return aliasLayerRoots(architecture);
}

/**
 * The layer-relative segments a specifier reaches through an alias, or null.
 * Prefix-aware: `~root/src/views/x` under `'~root': '.'` yields
 * `['views', 'x']` — the naive strip read `src` as the layer name and the
 * import went invisible while emitLint banned it (field issue #29).
 */
export function stripAlias(
  specifier: string,
  roots: (AliasRoot | string)[],
): string[] | null {
  for (const root of roots) {
    const { alias, prefix } = typeof root === 'string' ? { alias: root, prefix: [] } : root;

    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      const parts = specifier.slice(alias.length).split('/').filter(Boolean);

      // A specifier under the alias but outside the layer offset (e.g.
      // `~root/package.json`) is not a layer import at all.
      if (!prefix.every((segment, i) => parts[i] === segment)) {
        return null;
      }

      return parts.slice(prefix.length);
    }
  }

  return null;
}

/** Build an {@link EntryOf} from the architecture's module shapes. */
export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const shared = architecture.module?.entry ?? 'index';
  const perLayer = new Map(architecture.layers.map((l) => [l.name, l.module?.entry ?? shared]));

  return (layer) => perLayer.get(layer) ?? shared;
}

/** The module a reference targets, or null if it is not a resolvable module import. */
export function targetModuleKey(
  ref: ImportRef,
  file: ScannedFile,
  scope: { aliases: (AliasRoot | string)[]; layerNames: string[]; layoutOf: LayoutOf },
): string | null {
  const { aliases, layerNames, layoutOf } = scope;
  const parts = stripAlias(ref.specifier, aliases);

  if (parts) {
    return layerNames.includes(parts[0]) ? moduleKey(parts, layoutOf) : null;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

    return target ? moduleKey(target, layoutOf) : null;
  }

  return null;
}

export interface ModuleGraph {
  /** Every module observed under a declared layer. */
  modules: Set<string>;
  /** `from` module → the modules it imports (self-edges excluded). */
  edges: Map<string, Set<string>>;
}

/** Build the module-level import graph from a scan. */
export function buildModuleGraph(scan: ScanResult, architecture: ArchitectureDef): ModuleGraph {
  // Test files neither form modules nor create edges, as far as the globs reach
  // (idempotent re-filter when the caller already dropped them).
  scan = dropTestFiles(scan, architecture.testFiles);

  const layerNames = architecture.layers.map((layer) => layer.name);
  const aliases = aliasList(architecture);
  const layoutOf = layoutResolver(architecture);
  const graph: ModuleGraph = { modules: new Set(), edges: new Map() };

  for (const file of scan.files) {
    if (!layerNames.includes(file.segments[0])) {
      continue;
    }

    const from = moduleKey(file.segments, layoutOf);

    graph.modules.add(from);

    for (const ref of file.imports) {
      const to = targetModuleKey(ref, file, { aliases, layerNames, layoutOf });

      if (to && to !== from) {
        graph.edges.set(from, (graph.edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return graph;
}
