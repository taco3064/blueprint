import type { AliasRoot, ArchitectureDef } from '../config';
import { DEFAULT_MODULE_SHAPE, getModuleShape } from '../config';

/**
 * Where a specifier or a path lands, in the coordinates a module boundary is
 * drawn in: the alias strip, the relative walk, and the module key both sides
 * of an import are compared as. Pure over strings and segments — the judgments
 * that consume these sit in `verdict` next door.
 */

/** Per-layer layout resolver — a segment's first element names its layer. */
export type LayoutOf = (layer: string) => 'folder' | 'file';

/** Build a {@link LayoutOf} from the architecture's per-layer module shapes. */
export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  return (layer) => getModuleShape(architecture, layer).layout;
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
 * `moduleDepth` — the layer sits at `segments[depth]`, and everything
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

  if (segments.length < depth + 2 || layoutOf(layer) === 'file') {
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
