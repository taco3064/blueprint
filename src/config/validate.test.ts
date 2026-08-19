import { describe, expect, it } from 'vitest';

import { rejectUnknownKeys } from './validate';

// The rendered rejections, restated here because `validate.ts` keeps both
// tables private: a rename that stops replacing the generic opening, or a
// generic rejection that starts carrying rename advice, turns one case red.
const SILENTLY_DEAD = 'nothing reads it, so the declaration is silently dead';
const RENAMED = 'module was RENAMED to folder — same keys, same behavior, nothing removed';

/** The message `rejectUnknownKeys` actually renders, not the fact that it threw. */
function rejection(value: object, allowed: string[], where: string): string {
  try {
    rejectUnknownKeys(value, allowed, where);
  } catch (error) {
    return (error as Error).message;
  }

  return '';
}

describe('rejectUnknownKeys · a key the schema does not know', () => {
  it('says nothing about a value whose keys are all allowed', () => {
    expect(rejection({ layout: 'flat' }, ['layout', 'entry'], 'architecture.folder')).toBe('');
  });

  it('opens on the silently dead declaration and lists the keys it expected', () => {
    const message = rejection({ flow: 'one-way' }, ['alias', 'layers'], 'architecture');

    expect(message).toBe(
      `Unknown key "flow" in architecture — ${SILENTLY_DEAD}. Expected keys: alias, layers.`,
    );
  });

  it('suffixes the home a misplaced key belongs at, keeping that opening (field issue #14)', () => {
    // selfOnly was never documented anywhere else, so its declaration really is
    // dead where it was written — the generic opening is true and stays.
    const message = rejection({ selfOnly: true }, ['name', 'does'], 'layer "components"');

    expect(message).toContain(`Unknown key "selfOnly" in layer "components" — ${SILENTLY_DEAD}.`);
    expect(message).toContain('selfOnly lives on an allowedImporters ENTRY');
  });
});

describe('rejectUnknownKeys · a key this major renamed', () => {
  it.each([
    ['architecture', ['alias', 'layers', 'folder']],
    ['layer "components"', ['name', 'does', 'folder']],
  ])('opens on the rename and names the declaration to edit: %s', (where, allowed) => {
    const message = rejection({ module: { layout: 'folder' } }, allowed, where);

    expect(message).toBe(
      `${RENAMED}. Spell it folder: { layout: 'folder', entry: 'index' } in ${where}.`,
    );

    // The half that passes on the unfixed tree if only the arm above is checked.
    expect(message).not.toContain(SILENTLY_DEAD);
  });

  // The site is config data, and a layer name may legally carry these:
  // `validateLayerName` turns away glob, path, quote and diagram characters, and
  // neither set holds `$` or a backtick. Rendered as a replacement pattern they
  // are directives, not text — `$$` collapses to one `$`, and `` $` `` inlines
  // everything before the placeholder, so the message quotes a declaration the
  // adopter does not have.
  it.each([
    ['layer "price$$tag"'],
    ['layer "a$`b"'],
  ])('names the site as literal text, not as a replacement pattern: %s', (where) => {
    const message = rejection({ module: { layout: 'folder' } }, ['name', 'does', 'folder'], where);

    expect(message).toBe(
      `${RENAMED}. Spell it folder: { layout: 'folder', entry: 'index' } in ${where}.`,
    );
  });

  it('falls back to the generic rejection where the successor is not a key either', () => {
    // A site with no `folder` never accepted `module` under either spelling, so
    // "spell it folder here" would point at a key that does not exist there.
    const allowed = ['name', 'does', 'layers', 'owns', 'allowedImporters', 'entry'];
    const message = rejection({ module: { layout: 'folder' } }, allowed, 'module "cart"');

    expect(message).toBe(
      `Unknown key "module" in module "cart" — ${SILENTLY_DEAD}. Expected keys: ${allowed.join(', ')}.`,
    );

    expect(message).not.toContain('RENAMED');
  });
});
