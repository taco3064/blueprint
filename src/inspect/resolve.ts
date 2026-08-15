import { layoutResolver, moduleKey, resolveSegments, stripAlias } from '../boundary';
import type { LayoutOf } from '../boundary';
import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots } from '../config';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * A scan resolved into modules: which module a reference targets, and the
 * module import graph `analyze` (findings, cycles) and `deps` (blast radius)
 * read. The coordinates and the judgments both this and the embedded
 * `blueprint/relative-escape` rule are built on live one layer down, in
 * `boundary`.
 */

/** The layer-reaching aliases with their offsets — see {@link aliasLayerRoots}. */
export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return aliasLayerRoots(architecture);
}

/** The module a reference targets, or null if it is not a resolvable module import. */
export function targetModuleKey(
  ref: ImportRef,
  file: ScannedFile,
  aliases: (AliasRoot | string)[],
  layerNames: string[],
  layoutOf: LayoutOf,
): string | null {
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
  // Test files neither form modules nor create edges (idempotent re-filter
  // when the caller already dropped them).
  scan = dropTestFiles(scan, architecture.testFiles);

  const layerNames = architecture.layers.map((layer) => layer.name);
  const aliases = aliasList(architecture);
  const layoutOf = layoutResolver(architecture);
  const modules = new Set<string>();
  const edges = new Map<string, Set<string>>();

  for (const file of scan.files) {
    if (!layerNames.includes(file.segments[0])) {
      continue;
    }

    const from = moduleKey(file.segments, layoutOf);

    modules.add(from);

    for (const ref of file.imports) {
      const to = targetModuleKey(ref, file, aliases, layerNames, layoutOf);

      if (to && to !== from) {
        edges.set(from, (edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return { modules, edges };
}
