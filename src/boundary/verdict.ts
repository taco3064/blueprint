import type { AliasRoot } from '../config';
import { moduleKey, stripAlias } from './resolve';
import type { EntryOf, LayoutOf } from './resolve';

/**
 * What an import does to a module boundary — one judgment per gate, read by
 * both `inspect`'s findings and the embedded ESLint rules so that neither can
 * reach a conclusion the other would not. Each judgment consumes the
 * coordinates `resolve` produces next door.
 */

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

  // No layout test: for a file-layout layer `moduleKey` collapses to the layer name, so
  // the equality check above already returned `ok` — a `layoutOf` arm here is unreachable.
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

/**
 * Whether an alias specifier addresses `module`'s own root, at any spelling.
 *
 * The single judgment behind both upward-edge gates —
 * `blueprint/no-module-root-import` and `inspect`'s `root-import` finding — for
 * the reason `relativeVerdict` gives above: two callers reading the same
 * coordinates can still disagree about what they mean, and here the whole point
 * is that no `no-restricted-imports` shape can express this set. Restating the
 * condition in the rule would make it two sources of truth that agree today.
 *
 * The root is every direct child of the module folder, so this is stated as an
 * absence: inside the same module, a specifier that reaches no DECLARED layer
 * reaches the root. That covers `~app/Fighter`, `~app/Fighter/index`,
 * `~app/Fighter/Fighter` and the same with an extension — and `paths` entries
 * can only carry the two names a config knows, which is why they cannot close
 * it and this exists.
 *
 * Callers exempt the module root itself: a root file composes the layers and may
 * reach every one of them.
 */
export function addressesModuleRoot(
  parts: string[],
  module: string,
  layerNames: string[],
  depth: number,
): boolean {
  // undecidable, the depth test: at depth 0 the other two conjuncts are
  // mutually exclusive — `parts[0] === module` makes the target this file's own
  // layer, which `layerNames.includes` then answers true for. The conjunction
  // cannot hold there however the depth is compared.
  return depth > 0 && parts[0] === module && !layerNames.includes(parts[depth]);
}
