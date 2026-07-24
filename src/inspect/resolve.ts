import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, getModuleShape } from '../config';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * Module-resolution primitives shared by `analyze` (findings, cycles),
 * `deps` (blast radius), and the embedded `blueprint/relative-escape` lint
 * rule: specifier → module key, plus the module import graph itself.
 */

/** Per-layer layout resolver — a segment's first element names its layer. */
export type LayoutOf = (layer: string) => 'folder' | 'flat';

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
      if (!prefix.every((segment, i) => parts[i] === segment)) return null;

      return parts.slice(prefix.length);
    }
  }

  return null;
}

/** The module a path belongs to, under its own layer's layout. */
export function moduleKey(segments: string[], layoutOf: LayoutOf): string {
  if (segments.length < 2 || layoutOf(segments[0]) === 'flat') return segments[0] ?? '';

  // A direct file module keeps its extension out of the key, so
  // `deps components/HelloWorld` and an import of `./HelloWorld.vue` both
  // resolve to the same module as the file `components/HelloWorld.vue`.
  return `${segments[0]}/${segments[1].replace(/\.[^.]+$/, '')}`;
}

export function resolveSegments(dir: string[], specifier: string): string[] | null {
  const stack = [...dir];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') continue;
    else if (part === '..') {
      if (!stack.length) return null;

      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack;
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
    if (!layerNames.includes(file.segments[0])) continue;

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
