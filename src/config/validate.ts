import type { LayerDef, ModuleDef } from './types';

/**
 * The validation primitives shared by every declared unit of the architecture.
 * A layer and a feature module are the same kind of declaration one depth
 * apart — both become a folder, a file glob and a diagram node — so the
 * checks that guard those two uses are written once, here, and told which
 * noun to say.
 */

/**
 * Keys the schema turns away pointed at where they went — a home they were never
 * at, or a name they used to have. Keyed by the key rather than by the object it
 * turned up on: the exact field shape validated fine on the layer, was silently
 * dead, and the intended re-export ban never emitted (field issue #14). A bare
 * "unknown key" reads as "removed", so a renamed key names its successor here.
 */
const MISPLACED_KEYS: Record<string, string> = {
  selfOnly: 'selfOnly lives on an allowedImporters ENTRY, naming the importing layer: '
    + 'allowedImporters: [{ layer: \'views\', selfOnly: true }]',
  module: 'module was RENAMED to folder — same keys, same behavior, nothing removed. '
    + 'Spell it folder: { layout: \'folder\', entry: \'index\' } here.',
};

/**
 * A key the schema does not know is a silently dead declaration — the author
 * believes a constraint is active while nothing compiles from it (field issue #14).
 * Fail loud, and point misplaced keys home.
 */
export function rejectUnknownKeys(value: object, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) {
      continue;
    }

    throw new Error(
      `Unknown key "${key}" in ${where} — nothing reads it, so the declaration is `
      + `silently dead. ${MISPLACED_KEYS[key] ?? `Expected keys: ${allowed.join(', ')}.`}`,
    );
  }
}

/**
 * Validate an `owns` list — each entry is a package, global, or shorthand. Shared by
 * a layer and a module: both become a folder, a file glob and a diagram node one depth
 * apart, and `owns` means the same thing on either — exclusive ownership of a primitive.
 */
export function validateOwns(
  owner: LayerDef | ModuleDef,
  kind: 'Layer' | 'Module' = 'Layer',
): void {
  if (!owner.owns) {
    return;
  }

  for (const primitive of owner.owns) {
    if (typeof primitive === 'string') {
      if (!primitive.trim()) {
        throw new Error(`${kind} "${owner.name}" owns an empty package name.`);
      }
    } else if ('global' in primitive) {
      if (typeof primitive.global !== 'string' || !primitive.global.trim()) {
        throw new Error(`${kind} "${owner.name}" owns a global with no name.`);
      }

      rejectUnknownKeys(primitive, ['global'], `${kind.toLowerCase()} "${owner.name}" owns entry "${primitive.global}"`);
    } else if (typeof primitive.package !== 'string' || !primitive.package.trim()) {
      throw new Error(`${kind} "${owner.name}" owns a package with no name.`);
    } else {
      rejectUnknownKeys(primitive, ['package', 'imports', 'pattern', 'exempt'], `${kind.toLowerCase()} "${owner.name}" owns entry "${primitive.package}"`);
    }
  }
}
