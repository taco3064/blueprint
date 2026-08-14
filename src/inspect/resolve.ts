import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, moduleDepth } from '../config';
import { layoutResolver, moduleKey, resolveSegments, stripAlias } from '../boundary';
import type { LayoutOf } from '../boundary';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * The module import graph `analyze` (findings, cycles) and `deps` (blast
 * radius) read a project through: specifier → module key, node by node. The
 * primitives it stands on — `moduleKey`, `stripAlias`, `resolveSegments` —
 * live in `boundary`, one module below, because the embedded lint plugin
 * reaches the same judgments through them.
 */

/** The layer-reaching aliases with their offsets — see {@link aliasLayerRoots}. */
export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return aliasLayerRoots(architecture);
}

/**
 * The node a reference targets, or null if it is not a resolvable import.
 *
 * Both arms read the same offset. Given it to the alias arm alone, one function
 * would key `~app/Combat/hooks/attack` at module depth and
 * `../../Combat/hooks/attack` at layer depth — two nodes for one file, and a
 * graph that disagrees with itself about what a segment is.
 */
export function targetModuleKey(
  ref: ImportRef,
  file: ScannedFile,
  aliases: (AliasRoot | string)[],
  layerNames: string[],
  layoutOf: LayoutOf,
  depth = 0,
): string | null {
  const parts = stripAlias(ref.specifier, aliases);

  if (parts) {
    // `~app/Combat` addresses a module entry — the one legal cross-module
    // spelling, and the edge that matters most in a modular repo. Read through
    // the layer test alone it reaches no declared layer and vanishes.
    if (depth > 0 && parts.length <= depth) return moduleKey(parts, layoutOf, depth);

    return layerNames.includes(parts[depth]) ? moduleKey(parts, layoutOf, depth) : null;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

    return target ? moduleKey(target, layoutOf, depth) : null;
  }

  return null;
}

export interface ModuleGraph {
  /** Every node observed — a unit under a declared layer, or a module root. */
  modules: Set<string>;
  /** `from` node → the nodes it imports (self-edges excluded). */
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
  const depth = moduleDepth(architecture);

  // A `layers: false` module has no layer vocabulary, so nothing inside it
  // sits at a declared layer and the whole module is one node. Read through the
  // layer test it contributes nothing at all — and the routing module is
  // usually the one importing everything, so its edges are the ones a reader
  // would miss first.
  // undecidable, the `?? []` arm: a fabricated member has no `layers` key, so
  // the filter drops it and the set is empty either way — which is what a flat
  // project has. Kept because the absent arm is real: this runs before any
  // depth test, on every project.
  const unlayered = new Set(
    (architecture.modules ?? []).filter((module) => module.layers === false)
      .map((module) => module.name),
  );

  const modules = new Set<string>();
  const edges = new Map<string, Set<string>>();

  for (const file of scan.files) {
    // The module root is a node of its own: it is where a module's composition
    // code sits, and `Fighter/index.ts` importing `~app/Combat` is the edge a
    // reader of this graph most wants. Judged by the layer test alone it is
    // skipped, because its segment at layer depth is a filename.
    // undecidable, the depth test: `unlayered` is built from
    // `architecture.modules`, so a flat project's set is empty and the lookup
    // answers false however the depth compares. It stays as the reader's
    // signpost — this whole arm exists only under modules.
    const whole = depth > 0 && unlayered.has(file.segments[0]);
    const isRoot = depth > 0 && file.segments.length === depth + 1;

    if (!whole && !isRoot && !layerNames.includes(file.segments[depth])) continue;

    const from = whole ? file.segments[0] : moduleKey(file.segments, layoutOf, depth);

    modules.add(from);

    for (const ref of file.imports) {
      const to = targetModuleKey(ref, file, aliases, layerNames, layoutOf, depth);

      if (to && to !== from) {
        edges.set(from, (edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return { modules, edges };
}

export interface FolderGraph {
  /** Top-level folders holding source — declared or not. */
  folders: Set<string>;
  /** `from` folder → the top folders it imports (self-edges excluded). */
  edges: Map<string, Set<string>>;
}

/**
 * Top folder → top folder, **undeclared roots included**.
 *
 * {@link buildModuleGraph} cannot answer this and is not a near miss: it admits
 * only files under declared names, and an undeclared module is undeclared by
 * definition. Asked of it, the position inference would read "no evidence" for
 * every real case, and the interval outcome the hint exists for would be
 * unreachable — a hint that is silent exactly where it is needed.
 *
 * `survey` computes this same shape and is deliberately not reused: it sits
 * ABOVE `inspect` in the layering, so importing it would run the dependency
 * backwards. Two derivations of one shape is the cost, and the layering is what
 * it buys.
 */
export function buildFolderGraph(scan: ScanResult, architecture: ArchitectureDef): FolderGraph {
  scan = dropTestFiles(scan, architecture.testFiles);

  const aliases = aliasList(architecture);
  const folders = new Set(scan.topDirs);
  const edges = new Map<string, Set<string>>();

  for (const file of scan.files) {
    const from = file.segments[0];

    // A file directly under the source root belongs to no folder — it is app
    // wiring, and an edge from it would name a folder that does not exist.
    //
    // undecidable, the length test, shielded by the lookup beside it: `folders`
    // is exactly `scan.topDirs`, and a root file's first segment is a FILENAME
    // carrying an extension, so it can never be one of those names. Removing
    // either alone still skips the same files. The pair stays because the two
    // say different things — one is "this is not in a folder", the other is
    // "this folder is not one we saw" — and a reader should not have to derive
    // the first from how extensions happen to look.
    if (file.segments.length < 2 || !folders.has(from)) continue;

    for (const ref of file.imports) {
      const to = folderTarget(ref, file, aliases, folders);

      if (to !== null && to !== from) {
        edges.set(from, (edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return { folders, edges };
}

/** The top folder a reference lands in, or null when it lands outside them all. */
function folderTarget(
  ref: ImportRef,
  file: ScannedFile,
  aliases: AliasRoot[],
  folders: Set<string>,
): string | null {
  const parts = stripAlias(ref.specifier, aliases);

  // undecidable, both length tests: an empty list reads `[0]` as `undefined`,
  // and `folders.has(undefined)` is false — the same null the guard produces.
  // They stay because "the alias root is not a folder" is a statement worth
  // being able to read here, not an accident of how `Set.has` treats a hole.
  if (parts) return parts.length > 0 && folders.has(parts[0]) ? parts[0] : null;

  // undecidable, the relative test: a bare package name resolves against this
  // file's own directory, so its first segment is this file's own folder and
  // the self-edge check drops it. The test stays because that is a coincidence
  // of where the file sits, not a decision this function should lean on.
  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

    return target && target.length > 0 && folders.has(target[0]) ? target[0] : null;
  }

  return null;
}
