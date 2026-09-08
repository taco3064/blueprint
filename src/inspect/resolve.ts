import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, getModuleShape } from '../config';
import { moduleKey, resolveSegments } from '../plugin';
import type { EntryOf, LayoutOf } from '../plugin';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

export type { EntryOf, LayoutOf, ModuleShape, RelativeVerdict } from '../plugin';
export { moduleKey, relativeVerdict, resolveSegments } from '../plugin';

export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  return (layer) => getModuleShape(architecture, layer).layout;
}

export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return aliasLayerRoots(architecture);
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

export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const shared = architecture.module?.entry ?? 'index';
  const perLayer = new Map(architecture.layers.map((l) => [l.name, l.module?.entry ?? shared]));

  return (layer) => perLayer.get(layer) ?? shared;
}

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

  modules: Set<string>;

  edges: Map<string, Set<string>>;
}

export function buildModuleGraph(scan: ScanResult, architecture: ArchitectureDef): ModuleGraph {
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
