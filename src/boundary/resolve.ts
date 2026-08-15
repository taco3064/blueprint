import type { AliasRoot, ArchitectureDef } from '../config';
import { getModuleShape } from '../config';

/**
 * Where a specifier or a path lands, in the coordinates a module boundary is
 * drawn in: the alias strip, the relative walk, and the module key both sides
 * of an import are compared as. Pure over strings and segments — the judgment
 * that consumes them sits in `verdict` next door.
 */

/** Per-layer layout resolver — a segment's first element names its layer. */
export type LayoutOf = (layer: string) => 'folder' | 'flat';

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

/** A layer's public entry filename, extension stripped. */
export type EntryOf = (layer: string) => string;

/** Build an {@link EntryOf} from the architecture's module shapes. */
export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const shared = architecture.module?.entry ?? 'index';
  const perLayer = new Map(architecture.layers.map((l) => [l.name, l.module?.entry ?? shared]));

  return (layer) => perLayer.get(layer) ?? shared;
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
