import type { LayerDef, ModuleDef, OwnedPackage } from './types';

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
      validateOwnedGlobs(primitive, owner.name, kind);
    }
  }
}

/** The wildcards every matcher in play agrees about, named as an author writes them. */
const WILDCARDS = '"*" (one path segment), "**" (a whole path segment) and "?" (one character)';

/**
 * The `pattern` / `exempt` globs of one entry, each against the matcher it is
 * emitted into — a narrower grammar than either of them, on purpose.
 *
 * One entry reaches ESLint through two different libraries. A `pattern: true`
 * package becomes a `no-restricted-imports` group, matched with gitignore
 * semantics by the `ignore` package; an `exempt` file glob becomes a config
 * entry's `ignores`, matched by minimatch. `inspect` reads both through one
 * small compiler that knows `*`, `**`, `?`, and — on the file side only —
 * `{a,b}`. Where the three grammars disagree the tool would enforce one ban and
 * report another, which is the single thing this axis exists to make impossible,
 * so the declaration is refused here instead of approximated: a narrow contract
 * that can be honoured beats a broad one that cannot. Same posture as
 * `unavailableGate` — a gate you cannot open is not a gate.
 */
function validateOwnedGlobs(owned: OwnedPackage, owner: string, kind: 'Layer' | 'Module'): void {
  const at = `${kind} "${owner}" owns "${owned.package}"`;
  const defect = owned.pattern ? patternGlobDefect(owned.package) : null;

  if (defect !== null) {
    throw new Error(
      `${at} with pattern: true, and ${defect}. A pattern glob may use ${WILDCARDS}; `
      + 'write one owns entry per package for anything finer.',
    );
  }

  for (const glob of owned.exempt ?? []) {
    const found = exemptGlobDefect(glob);

    if (found !== null) {
      throw new Error(
        `${at} with the exempt glob "${glob}", and ${found}. An exempt glob may use `
        + `${WILDCARDS}, plus a flat "{a,b}" alternation; list the paths as separate `
        + 'exempt globs for anything finer.',
      );
    }
  }
}

/** Constructs BOTH ESLint matchers read and the simplified compiler does not. */
function sharedGlobDefect(glob: string): string | null {
  if (glob.startsWith('!')) {
    return 'it starts with "!", a negation ESLint applies and inspect reads as a literal character';
  }

  if (glob.startsWith('/')) {
    return 'it starts with "/", a character ESLint gives meaning to and inspect takes '
      + 'literally — and nothing this is matched against carries one: an import specifier '
      + 'never begins with a slash, and a scanned path is repo-relative';
  }

  if (glob.endsWith('/')) {
    return 'it ends with "/", a directory marker ESLint gives meaning to and inspect takes '
      + 'literally — and nothing this is matched against ends with one';
  }

  if (glob.includes('\\')) {
    return 'it contains "\\", an escape ESLint applies and inspect reads as a literal backslash';
  }

  if (/[[\]]/.test(glob)) {
    return 'it contains a "[…]" character class, which ESLint expands and inspect reads as '
      + 'literal brackets';
  }

  if (glob.split('/').some((segment) => segment !== '**' && segment.includes('**'))) {
    return 'it uses "**" inside a path segment, where ESLint reads a wildcard that stops at '
      + '"/" and inspect reads one that crosses it';
  }

  return null;
}

/** The gitignore-shaped half: a `pattern: true` package glob. */
function patternGlobDefect(glob: string): string | null {
  const shared = sharedGlobDefect(glob);

  if (shared !== null) {
    return shared;
  }

  return /[{}]/.test(glob)
    ? 'it contains "{…}", which is not alternation here: a no-restricted-imports group is '
    + 'gitignore-shaped and has no brace expansion, so both engines would ban the literal '
    + 'specifier and nothing is published under that name'
    : null;
}

/** The minimatch-shaped half: an `exempt` file glob. */
function exemptGlobDefect(glob: string): string | null {
  const shared = sharedGlobDefect(glob);

  if (shared !== null) {
    return shared;
  }

  if (/[()]/.test(glob)) {
    return 'it contains "(…)", an extglob ESLint expands and inspect reads as literal parentheses';
  }

  return braceDefect(glob);
}

/**
 * The one alternation shape minimatch and the compiler agree on: a flat `{a,b}`
 * carrying at least one comma. Minimatch reads a comma-less `{a}` as three
 * literal characters and expands `{1..3}` as a range, where the compiler does
 * the opposite of each — and an unclosed `{` it cannot parse at all.
 */
function braceDefect(glob: string): string | null {
  let index = 0;

  while (index < glob.length) {
    const open = glob.indexOf('{', index);

    if (open === -1) {
      return null;
    }

    const close = glob.indexOf('}', open);

    if (close === -1) {
      return 'it opens a "{" that is never closed — ESLint reads that as a literal brace, and '
        + 'inspect cannot compile it at all';
    }

    const defect = groupBodyDefect(glob.slice(open + 1, close));

    if (defect !== null) {
      return defect;
    }

    index = close + 1;
  }

  return null;
}

/** One `{…}` body, between its own braces. */
function groupBodyDefect(body: string): string | null {
  if (body.includes('{')) {
    return 'it nests "{…}" groups, which ESLint expands and inspect mis-parses at the first "}"';
  }

  if (body.includes('..')) {
    return 'it contains a "{a..z}" range, which ESLint expands and inspect reads as literal '
      + 'characters';
  }

  return body.includes(',')
    ? null
    : 'it contains a "{…}" group with no comma, which ESLint reads as literal braces and '
      + 'inspect expands as a one-branch alternation';
}
