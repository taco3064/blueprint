import type {
  AliasRoot,
  ArchitectureDef,
  ResolvedPosition,
} from '../config';
import { resolveArchitecture } from '../config';
import { moduleKey, resolveSegments } from '../plugin';
import type { EntryOf, LayoutOf } from '../plugin';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

export type { EntryOf, LayoutOf, ModuleShape, RelativeVerdict } from '../plugin';
export { moduleKey, relativeVerdict, resolveSegments } from '../plugin';

export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  const resolved = resolveArchitecture(architecture);

  return (layer) => resolved.layers.find((candidate) => candidate.name === layer)?.unit.layout
    ?? 'file';
}

export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const resolved = resolveArchitecture(architecture);
  const perLayer = new Map(resolved.layers.map((layer) => [layer.name, layer.unit.entry]));

  return (layer) => perLayer.get(layer) ?? 'index';
}

export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return resolveArchitecture(architecture).aliases;
}

export function stripAlias(
  specifier: string,
  roots: (AliasRoot | string)[],
): string[] | null {
  for (const root of roots) {
    const { alias, prefix } = typeof root === 'string' ? { alias: root, prefix: [] } : root;

    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      const parts = specifier.slice(alias.length).split('/').filter(Boolean);

      if (!prefix.every((segment, i) => parts[i] === segment)) {
        return null;
      }

      const prepend = typeof root === 'string' ? [] : root.prepend ?? [];

      return [...prepend, ...parts.slice(prefix.length)];
    }
  }

  return null;
}

/** Canonical graph key for an inner unit position. */
export function unitKey(position: ResolvedPosition): string | null {
  const layer = position.layer;

  if (!layer || position.inner !== 'layer') {
    return null;
  }

  const prefix = position.module ? `${position.module.name}/` : '';

  if (layer.unit.layout === 'file') {
    return `${prefix}${layer.name}`;
  }

  return position.unit === null ? null : `${prefix}${layer.name}/${position.unit}`;
}

export function targetUnitKey(
  ref: ImportRef,
  file: ScannedFile,
  architecture: ArchitectureDef,
): string | null {
  const resolved = resolveArchitecture(architecture);
  const target = resolved.resolveImportPosition(file.segments, ref.specifier);

  return target === null ? null : unitKey(target);
}

export interface UnitGraph {
  units: Set<string>;
  edges: Map<string, Set<string>>;
}

/** Build the concrete inner-unit graph using the canonical architecture resolver. */
export function buildUnitGraph(scan: ScanResult, architecture: ArchitectureDef): UnitGraph {
  scan = dropTestFiles(scan, architecture.testFiles);

  const resolved = resolveArchitecture(architecture);
  const graph: UnitGraph = { units: new Set(), edges: new Map() };

  for (const file of scan.files) {
    const from = unitKey(resolved.classify(file.segments));

    if (from === null) {
      continue;
    }

    graph.units.add(from);

    for (const ref of file.imports) {
      const to = targetUnitKey(ref, file, architecture);

      if (to && to !== from) {
        graph.edges.set(from, (graph.edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return graph;
}

/** @deprecated Internal 3.x name retained while callers migrate to unit vocabulary. */
export interface ModuleGraph {
  modules: Set<string>;
  edges: Map<string, Set<string>>;
}

/** @deprecated Use buildUnitGraph. */
export function buildModuleGraph(scan: ScanResult, architecture: ArchitectureDef): ModuleGraph {
  const graph = buildUnitGraph(scan, architecture);

  return { modules: graph.units, edges: graph.edges };
}

/**
 * @deprecated Legacy helper for direct tests. New architecture consumers must
 * resolve imports through resolveArchitecture().resolveImportPosition().
 */
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
