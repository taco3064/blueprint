import type { AliasRoot, ArchitectureDef, ModuleDef } from '../config';
import { aliasLayerRoots, getFolderShape, getModules } from '../config';
// The `nets` leaf, not the emit/lint index — the index also exports lint.ts,
// which loads the plugin, which imports this file. Type-only, so nothing of it
// survives into the plugin's own bundle either.
import type { NetScope } from '../emit/lint/nets';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * Module-resolution primitives shared by `analyze` (findings, cycles),
 * `deps` (blast radius), and the embedded `blueprint/relative-escape` lint
 * rule: specifier → module key, plus the module import graph itself.
 */

/** Per-layer layout resolver — a segment's first element names its layer. */
export type LayoutOf = (layer: string) => 'folder' | 'flat';

/** Build a {@link LayoutOf} from the architecture's per-layer folder shapes. */
export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  return (layer) => getFolderShape(architecture, layer).layout;
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

/** The module a path belongs to, under its own layer's layout. */
export function moduleKey(segments: string[], layoutOf: LayoutOf): string {
  if (segments.length < 2 || layoutOf(segments[0]) === 'flat') {
    return segments[0] ?? '';
  }

  // A direct file module keeps its extension out of the key, so
  // `deps components/HelloWorld` and an import of `./HelloWorld.vue` both
  // resolve to the same module as the file `components/HelloWorld.vue`.
  return `${segments[0]}/${segments[1].replace(/\.[^.]+$/, '')}`;
}

/** Whether a name is one of the architecture's declared layers. */
export type IsLayer = (name: string) => boolean;

/**
 * Build an {@link IsLayer} from the architecture's declared layers — the same
 * "is this a layer" question {@link ModuleShape.isLayer} answers for
 * {@link modularVerdict}. One builder, so a segment-count shortcut standing in
 * for it (as `graphKey` once did) is not a second, silently different answer.
 */
export function layerChecker(architecture: ArchitectureDef): IsLayer {
  const names = new Set(architecture.layers.map((layer) => layer.name));

  return (name) => names.has(name);
}

/** The declared shape a scanned path is read against, resolved once per run. */
export interface Structure {
  /** Declared feature modules — empty under the flat structure. */
  modules: ModuleDef[];
  isLayer: IsLayer;
}

/** Read the module + layer declarations a scan is judged against. */
export function structureOf(architecture: ArchitectureDef): Structure {
  return { modules: getModules(architecture), isLayer: layerChecker(architecture) };
}

/**
 * Where one path sits in the declared structure. {@link NetScope} is the same
 * coordinate pair `emit/lint` writes one config entry per, read from the other
 * end — from a scanned path rather than from the declaration — so a file and the
 * entry governing it are named by one vocabulary.
 */
export interface PathScope extends NetScope {
  /** The segments with the module stripped: the flat layer model's own view. */
  inner: string[];
  /** False when no declared module or layer covers this path at all. */
  governed: boolean;
}

/**
 * Which module and layer a path's segments sit in. Flat, `module` is null and
 * `inner` IS `segments` — `segments[0]` is the layer, exactly as before modules
 * existed.
 *
 * Modular, a path is governed when it reaches a net: a `layers: false` module's
 * whole subtree, a layered module's own root file, or a declared layer inside
 * one. A folder that is neither (`App/utils/`) is ungoverned on purpose — the
 * emitted config writes no entry for it, so a finding about its imports would be
 * a story eslint never tells.
 */
export function pathScope(segments: string[], structure: Structure): PathScope {
  const { modules, isLayer } = structure;

  if (!modules.length) {
    const layer = isLayer(segments[0]) ? segments[0] : null;

    return { module: null, layer, inner: segments, governed: layer !== null };
  }

  const module = modules.find((entry) => entry.name === segments[0]);

  if (!module) {
    return { module: null, layer: null, inner: segments, governed: false };
  }

  const inner = segments.slice(1);

  if (module.layers === false) {
    return { module: module.name, layer: null, inner, governed: true };
  }

  const layer = isLayer(inner[0]) ? inner[0] : null;

  return { module: module.name, layer, inner, governed: layer !== null || inner.length <= 1 };
}

/** A layer's public entry filename, extension stripped. */
export type EntryOf = (layer: string) => string;

/** Build an {@link EntryOf} from the architecture's folder shapes. */
export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const shared = architecture.folder?.entry ?? 'index';
  const perLayer = new Map(architecture.layers.map((l) => [l.name, l.folder?.entry ?? shared]));

  return (layer) => perLayer.get(layer) ?? shared;
}

/** What a relative import does to its folder boundary. */
export type RelativeVerdict = 'ok' | 'escapes-src' | 'leaves-layer' | 'reaches-inside';

/** The two per-layer resolvers every folder-shape judgment reads. */
export interface FolderShape {
  layoutOf: LayoutOf;
  entryOf: EntryOf;
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
  shape: FolderShape,
): RelativeVerdict {
  const { layoutOf, entryOf } = shape;

  if (target === null) {
    return 'escapes-src';
  }

  if (moduleKey(target, layoutOf) === moduleKey(ownSegments, layoutOf)) {
    return 'ok';
  }

  const layer = ownSegments[0];

  // No layout test: for a flat layer `moduleKey` collapses to the layer name, so the
  // equality check above already returned `ok` — a `layoutOf` arm here is unreachable.
  if (target[0] !== layer) {
    return 'leaves-layer';
  }

  const entry = entryOf(layer);

  const atEntry
    = target.length === 2
      || (target.length === 3 && target[2].replace(/\.[^.]+$/, '') === entry);

  return atEntry ? 'ok' : 'reaches-inside';
}

/** What a relative import does to its boundaries under a modular structure. */
export type ModularVerdict = RelativeVerdict | 'leaves-module';

/** The folder-shape resolvers, plus the one question a module depth adds. */
export interface ModuleShape extends FolderShape {
  /** Whether a segment names a declared layer. */
  isLayer: (name: string) => boolean;
}

/**
 * The modular twin of {@link relativeVerdict}, and one function for the same
 * reason: the embedded lint rule and `inspect` must not be able to reach
 * different conclusions about the same import.
 *
 * Another module is reachable only at its entry, through the alias, so a
 * relative path that lands in one is a violation whatever it points at.
 * Inside the module the layer model applies verbatim — the module segment is
 * stripped from both sides, so `relativeVerdict` never learns that modules
 * exist. A file sitting at the module's own root (or inside a module holding
 * its files directly) is in no layer, so it has no layer boundary to cross:
 * it may relatively import anything inside its own module, unconstrained.
 */
export function modularVerdict(
  ownSegments: string[],
  target: string[] | null,
  shape: ModuleShape,
): ModularVerdict {
  if (target === null) {
    return 'escapes-src';
  }

  if (target[0] !== ownSegments[0]) {
    return 'leaves-module';
  }

  const own = ownSegments.slice(1);

  if (own.length < 2 || !shape.isLayer(own[0])) {
    return 'ok';
  }

  return relativeVerdict(own, target.slice(1), shape);
}

export function resolveSegments(dir: string[], specifier: string): string[] | null {
  const stack = [...dir];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    } else if (part === '..') {
      if (!stack.length) {
        return null;
      }

      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack;
}

/**
 * The full-path deps-graph key: `moduleKey`'s layer+folder arithmetic, with the
 * module dimension composed on top. `modules` empty (the flat structure), this IS
 * `moduleKey` unchanged — `segments[0]` is the layer. Modular and `segments[0]`
 * names a declared module, it is stripped and the layer model applies to what
 * remains — UNLESS the module has no layer dimension to key deeper on at all.
 *
 * A `layers: false` module never has one, so every file collapses to the bare
 * module name regardless of depth. A layered module's single remaining segment
 * is genuinely ambiguous on segment count alone — `moduleKey(['hooks'], ...)`
 * and `moduleKey(['Combat.tsx'], ...)` are both one segment — and `isLayer` is
 * what tells them apart, the same primitive `modularVerdict` already reads for
 * the identical question one line above it: `inner[0]` naming a declared layer
 * is a bare cross-layer entry reach (`~app/Combat/hooks`, AC2's own paired
 * example) and keys one segment deeper — `moduleKey` on a single segment already
 * answers that segment's own name via its own length check, so composing
 * through it costs nothing extra. Anything else at one segment or none — a real
 * root file (`Combat/Combat.tsx`) or the bare module entry (`~app/Combat`) — is
 * the module's own root and collapses to the module name, the same "one net for
 * the whole thing" `nets.ts`'s `moduleNets` builds for either root shape.
 */
export function graphKey(
  segments: string[],
  scope: { modules: ModuleDef[]; isLayer: IsLayer; layoutOf: LayoutOf },
): string {
  const { modules, isLayer, layoutOf } = scope;
  const module = modules.find((entry) => entry.name === segments[0]);

  if (!module) {
    return moduleKey(segments, layoutOf);
  }

  const inner = segments.slice(1);

  if (module.layers === false || inner.length === 0 || !isLayer(inner[0])) {
    return module.name;
  }

  return `${module.name}/${moduleKey(inner, layoutOf)}`;
}

/** The module a reference targets, or null if it is not a resolvable module import. */
export function targetModuleKey(
  ref: ImportRef,
  file: ScannedFile,
  scope: {
    aliases: (AliasRoot | string)[];
    isLayer: IsLayer;
    /** Declared modules — omit (or empty) for the flat structure. */
    modules?: ModuleDef[];
    layoutOf: LayoutOf;
  },
): string | null {
  const { aliases, isLayer, modules = [], layoutOf } = scope;
  const parts = stripAlias(ref.specifier, aliases);

  if (parts) {
    // Modular, the alias reaches the module folders, not the layer folders directly
    // — `parts[0]` names a module, and a bare layer name there is not one (the
    // asymmetry with the flat check below is real: modules and layers are never
    // both governed dimensions for the same segment at once).
    const governed = modules.length
      ? modules.some((entry) => entry.name === parts[0])
      : isLayer(parts[0]);

    return governed ? graphKey(parts, { modules, isLayer, layoutOf }) : null;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

    return target ? graphKey(target, { modules, isLayer, layoutOf }) : null;
  }

  return null;
}

export interface ModuleGraph {
  /** Every module observed under a declared layer. */
  modules: Set<string>;
  /** `from` module → the modules it imports (self-edges excluded). */
  edges: Map<string, Set<string>>;
}

/**
 * Build the module-level import graph from a scan. `segments[0]` names a
 * declared module when `architecture.modules` is set — never a layer, which is
 * exactly the arithmetic `graphKey` composes on top of `moduleKey`. Flat, this is
 * unchanged: `segments[0]` IS the layer, gated the same way it always was.
 */
export function buildModuleGraph(scan: ScanResult, architecture: ArchitectureDef): ModuleGraph {
  // Test files neither form modules nor create edges (idempotent re-filter
  // when the caller already dropped them).
  scan = dropTestFiles(scan, architecture.testFiles);

  const ctx = graphContext(architecture);
  const graph: ModuleGraph = { modules: new Set(), edges: new Map() };

  for (const file of scan.files) {
    addFileToGraph(graph, file, ctx);
  }

  return graph;
}

/** Every fact `buildModuleGraph` reads per file, resolved once for the whole scan. */
interface GraphContext {
  isLayer: IsLayer;
  modules: ModuleDef[];
  aliases: AliasRoot[];
  layoutOf: LayoutOf;
}

function graphContext(architecture: ArchitectureDef): GraphContext {
  return {
    isLayer: layerChecker(architecture),
    modules: getModules(architecture),
    aliases: aliasList(architecture),
    layoutOf: layoutResolver(architecture),
  };
}

/** One scanned file's own node and its outgoing edges, added in place. */
function addFileToGraph(graph: ModuleGraph, file: ScannedFile, ctx: GraphContext): void {
  const { isLayer, modules, aliases, layoutOf } = ctx;

  const governed = modules.length
    ? modules.some((entry) => entry.name === file.segments[0])
    : isLayer(file.segments[0]);

  if (!governed) {
    return;
  }

  const from = graphKey(file.segments, { modules, isLayer, layoutOf });

  graph.modules.add(from);

  for (const ref of file.imports) {
    const to = targetModuleKey(ref, file, { aliases, isLayer, modules, layoutOf });

    if (to && to !== from) {
      graph.edges.set(from, (graph.edges.get(from) ?? new Set()).add(to));
    }
  }
}
