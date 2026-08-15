import { moduleKey } from './resolve';
import type { EntryOf, LayoutOf } from './resolve';

/**
 * What an import does to a module boundary — one judgment per gate, read by
 * both `inspect`'s findings and the embedded ESLint rules so that neither can
 * reach a conclusion the other would not. Each judgment consumes the
 * coordinates `resolve` produces next door.
 */

/** What a relative import does to its module boundary. */
export type RelativeVerdict = 'ok' | 'escapes-src' | 'leaves-layer' | 'reaches-inside';

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
): RelativeVerdict {
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
