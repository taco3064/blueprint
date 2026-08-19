import type { LayerDef, ModuleDef } from './types';

/**
 * The validation primitives shared by every declared unit of the architecture.
 * A layer and a feature module are the same kind of declaration one depth
 * apart — both become a folder, a file glob and a diagram node — so the
 * checks that guard those two uses are written once, here, and told which
 * noun to say.
 */

/**
 * Keys the schema turns away pointed at the home they were never at. Keyed by
 * the key rather than by the object it turned up on: the exact field shape
 * validated fine on the layer, was silently dead, and the intended re-export ban
 * never emitted (field issue #14). The declaration really is dead here, so the
 * generic opening below states the truth and this pointer suffixes it — which is
 * the half a rename does NOT share, see {@link RENAMED_KEYS}.
 */
const MISPLACED_KEYS: Record<string, string> = {
  selfOnly: 'selfOnly lives on an allowedImporters ENTRY, naming the importing layer: '
    + 'allowedImporters: [{ layer: \'views\', selfOnly: true }]',
};

/**
 * Keys a major version renamed, each carrying its successor and the sentence
 * that migrates the author — `{where}` is filled with the site the key turned
 * up on, because that is the declaration they have to edit.
 *
 * A rename is not a typo, so it does not open like one. The author typed what
 * the previous major documented, and "nothing reads it, so the declaration is
 * silently dead" reports that as a mistake before saying the field moved — so
 * a rename replaces that opening rather than suffixing a note to it.
 *
 * `to` is separate from the prose because it decides whether the rename is the
 * answer at this site at all: a site that does not accept the successor never
 * accepted the old spelling either, so the key is genuinely unknown there and
 * takes the generic rejection. Measured before the split: `module` on an
 * `architecture.modules` entry, and at the blueprint root, both told the author
 * to spell `folder` at a site with no `folder` key.
 */
const RENAMED_KEYS: Record<string, { to: string; migration: string }> = {
  module: {
    to: 'folder',
    migration: 'module was RENAMED to folder — same keys, same behavior, nothing removed. '
      + 'Spell it folder: { layout: \'folder\', entry: \'index\' } in {where}.',
  },
};

/**
 * Fill a migration's `{where}` with the site as literal text — `join` has no
 * replacement-pattern language, and `replace`'s second argument does.
 */
function fillSite(migration: string, where: string): string {
  return migration.split('{where}').join(where);
}

/**
 * A key the schema does not know is a silently dead declaration — the author
 * believes a constraint is active while nothing compiles from it (field issue #14).
 * Fail loud, point misplaced keys home, and open on the rename for a key this
 * major renamed out from under a config that spelled it the documented way.
 */
export function rejectUnknownKeys(value: object, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) {
      continue;
    }

    const renamed = RENAMED_KEYS[key];

    throw new Error(
      renamed && allowed.includes(renamed.to)
        ? fillSite(renamed.migration, where)
        : `Unknown key "${key}" in ${where} — nothing reads it, so the declaration is `
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
