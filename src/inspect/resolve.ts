import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, DEFAULT_MODULE_SHAPE, getModuleShape } from '../config';
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

/**
 * The module a path belongs to, under its own layer's layout. `depth` is
 * {@link moduleDepth} — the layer sits at `segments[depth]`.
 */
export function moduleKey(segments: string[], layoutOf: LayoutOf, depth = 0): string {
  const layer = segments[depth];

  if (segments.length < depth + 2 || layoutOf(layer) === 'flat') return layer ?? '';

  // A direct file module keeps its extension out of the key, so
  // `deps components/HelloWorld` and an import of `./HelloWorld.vue` both
  // resolve to the same module as the file `components/HelloWorld.vue`.
  return `${layer}/${segments[depth + 1].replace(/\.[^.]+$/, '')}`;
}

/** A layer's public entry filename, extension stripped. */
export type EntryOf = (layer: string) => string;

/** Build an {@link EntryOf} from the architecture's module shapes. */
export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const { entry: fallback } = DEFAULT_MODULE_SHAPE;
  const perLayer = new Map(architecture.layers.map((l) => [l.name, l.entry ?? fallback]));

  return (layer) => perLayer.get(layer) ?? fallback;
}

/**
 * What a relative import does to its module boundary. The last two exist only
 * under `modules`: a layer reaching the module root is not "leaving a layer",
 * and crossing a module by relative path is not "escaping src" — neither maps
 * onto a flat verdict, and reusing one would make the finding say something
 * the reader then has to unlearn.
 */
export type RelativeVerdict
  = | 'ok'
    | 'escapes-src'
    | 'leaves-layer'
    | 'reaches-inside'
    | 'reaches-root'
    | 'leaves-module';

/**
 * A file directly under the module — `Fighter/Fighter.tsx`, `Fighter/index.ts`.
 * The implicit top layer: it may reach every declared layer through that
 * unit's entry, and nothing inside a layer may reach back to it.
 */
function isRoot(segments: string[], depth: number): boolean {
  return segments.length === depth + 1;
}

/**
 * Whether `target` stops at a unit's public surface — the unit folder itself,
 * or the entry file inside it. Judged against the TARGET's layer, which is the
 * same as the importer's for a sibling and deliberately not for the module
 * root reaching down.
 */
function atUnitEntry(
  target: string[],
  entryOf: EntryOf,
  depth: number,
): boolean {
  return target.length === depth + 2
    || (target.length === depth + 3
      && target[depth + 2].replace(/\.[^.]+$/, '') === entryOf(target[depth]));
}

/**
 * The single judgment behind both relative-import gates — `inspect`'s
 * `relative-escape` finding and the embedded `blueprint/relative-escape`
 * rule. It lives here because the two claimed to agree by sharing
 * resolution primitives, and did not: the same `../Sibling` could be legal
 * to one and illegal to the other, with no test positioned to see it. One
 * function means the disagreement is not expressible.
 *
 * A sibling's entry is reachable; reaching past it is not. Leaving the layer
 * is the alias's job, never a relative path.
 */
export function relativeVerdict(
  ownSegments: string[],
  target: string[] | null,
  layoutOf: LayoutOf,
  entryOf: EntryOf,
  depth = 0,
): RelativeVerdict {
  if (target === null) return 'escapes-src';
  if (moduleKey(target, layoutOf, depth) === moduleKey(ownSegments, layoutOf, depth)) return 'ok';

  // The modular arm answers own-root x target-root before any layer is read.
  // At depth 0 there is no module to be the root of — a file directly under
  // the source root is app wiring, which the callers skip — so a flat project
  // never enters here and its verdicts do not move.
  if (depth > 0) {
    // Crossing the module is decided first: `hooks` in one module and `hooks`
    // in another are different folders that compare equal by name alone.
    if (target[0] !== ownSegments[0]) return 'leaves-module';

    const ownRoot = isRoot(ownSegments, depth);
    const targetRoot = isRoot(target, depth);

    // Root to root is the module's own composition talking to itself.
    if (ownRoot && targetRoot) return 'ok';

    // Upward. The root composes the layers; a layer that reaches back to it
    // inverts the flow the module exists to express.
    if (targetRoot) return 'reaches-root';

    // Downward, through the target unit's entry — the root's own privilege.
    if (ownRoot) return atUnitEntry(target, entryOf, depth) ? 'ok' : 'reaches-inside';
  }

  // No layout test: for a flat layer `moduleKey` collapses to the layer name, so the
  // equality check above already returned `ok` — a `layoutOf` arm here is unreachable.
  if (target[depth] !== ownSegments[depth]) return 'leaves-layer';

  return atUnitEntry(target, entryOf, depth) ? 'ok' : 'reaches-inside';
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
