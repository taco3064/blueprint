import type { AliasRoot, ArchitectureDef } from '../config';
import { aliasLayerRoots, DEFAULT_MODULE_SHAPE, getModuleShape, moduleDepth } from '../config';
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
 * The node a path belongs to, under its own layer's layout. `depth` is
 * {@link moduleDepth} — the layer sits at `segments[depth]`, and everything
 * above it is the feature module.
 *
 * **The module segment is part of the key.** Without it `Fighter/hooks/useInput`
 * and `Combat/hooks/useInput` collapse into one node: `detectCycles` can then
 * report a cycle nobody wrote, and `relativeVerdict` answers `ok` to a relative
 * import that crosses a module boundary into a same-named unit — a false
 * negative in both gates at once, since they share this function.
 *
 * A path that stops at the module itself — `~app/Combat`, or a root file like
 * `Fighter/index.ts` — keys to the feature, which is the node its entry stands
 * for. At depth 0 there is no module segment and every arm below is what a flat
 * project has always produced.
 */
export function moduleKey(segments: string[], layoutOf: LayoutOf, depth = 0): string {
  const module = segments.slice(0, depth);

  // The module entry, and the root files that sit beside it.
  if (depth > 0 && segments.length <= depth + 1) return module.join('/');

  const layer = segments[depth];

  if (segments.length < depth + 2 || layoutOf(layer) === 'flat') {
    return [...module, layer ?? ''].join('/');
  }

  // A direct file module keeps its extension out of the key, so
  // `deps components/HelloWorld` and an import of `./HelloWorld.vue` both
  // resolve to the same module as the file `components/HelloWorld.vue`.
  return [...module, layer, segments[depth + 1].replace(/\.[^.]+$/, '')].join('/');
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

    // No root-to-root arm: both roots key to the module itself, so the
    // equality test above already answered `ok` — the module's own composition
    // talking to itself, decided one comparison earlier.

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

/**
 * The other module a specifier hands over, or null when it hands over none.
 *
 * The single judgment behind both pass-through gates —
 * `blueprint/no-module-reexport` and `inspect`'s `module-reexport` finding.
 * One function for the reason `relativeVerdict` gives next door: two callers
 * reading the same coordinates can still disagree about what they mean, and a
 * disagreement between a lint rule and a finding presents as one gate going
 * quiet rather than as a contradiction anyone can see.
 *
 * Null for this module's own surface, for a name nobody declared, and for
 * every non-alias specifier. A relative path that leaves the module is
 * `relative-escape`'s `leaves-module`; a package is not a module at all.
 */
export function crossModuleTarget(
  specifier: string,
  aliases: (AliasRoot | string)[],
  modules: string[],
  own: string,
): string | null {
  const parts = stripAlias(specifier, aliases);

  if (!parts?.length) return null;

  const target = parts[0];

  return target !== own && modules.includes(target) ? target : null;
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
