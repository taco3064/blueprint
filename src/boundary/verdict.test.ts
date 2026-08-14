import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { entryResolver, layoutResolver } from './resolve';
import { relativeVerdict } from './verdict';

const architecture: ArchitectureDef = {
  alias: '~app',
  layers: [
    { name: 'resources', does: 'feature modules', layout: 'folder' },
    { name: 'services', does: 'io', layout: 'folder', entry: 'service' },
    { name: 'utils', does: 'leaf helpers' },
  ],
};

const layoutOf = layoutResolver(architecture);
const entryOf = entryResolver(architecture);

describe('relativeVerdict', () => {
  const own = ['resources', 'matches', 'Row.ts'];

  it('allows anything inside the importer own module', () => {
    expect(relativeVerdict(own, ['resources', 'matches', 'parts', 'Cell.ts'], layoutOf, entryOf))
      .toBe('ok');
  });

  it('allows a sibling by its entry, folder or explicit file', () => {
    expect(relativeVerdict(own, ['resources', 'markets'], layoutOf, entryOf)).toBe('ok');
    expect(relativeVerdict(own, ['resources', 'markets', 'index.ts'], layoutOf, entryOf)).toBe('ok');
  });

  it('honours a layer own entry name', () => {
    const inServices = ['services', 'api', 'client.ts'];

    expect(relativeVerdict(inServices, ['services', 'feed', 'service.ts'], layoutOf, entryOf))
      .toBe('ok');

    expect(relativeVerdict(inServices, ['services', 'feed', 'index.ts'], layoutOf, entryOf))
      .toBe('reaches-inside');
  });

  it('refuses to reach past a sibling entry', () => {
    expect(relativeVerdict(own, ['resources', 'markets', 'parts', 'Cell.ts'], layoutOf, entryOf))
      .toBe('reaches-inside');
  });

  it('refuses to leave the layer, and reports an unresolvable target', () => {
    expect(relativeVerdict(own, ['services', 'api'], layoutOf, entryOf)).toBe('leaves-layer');
    expect(relativeVerdict(own, null, layoutOf, entryOf)).toBe('escapes-src');
  });

  it('leaves a file layer alone — it has no module folders to be inside of', () => {
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'money.ts'], layoutOf, entryOf))
      .toBe('ok');

    // The DEEP case, and the invariant this function's shape rests on: a file
    // layer has no inside, so a nested relative path within it is not reaching
    // into anything. Only the sibling case was covered, and there `moduleKey`
    // collapses both sides to the layer name whatever the layout says — so a
    // `layoutOf` that answered nonsense produced the same verdict, and the check
    // that used to catch that (`layoutOf(layer) !== 'folder'`, removed as
    // unreachable) was the suite's only hold on it.
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'sub', 'helper.ts'], layoutOf, entryOf))
      .toBe('ok');

    // …while the same shape under a FOLDER layer is exactly what is banned.
    expect(relativeVerdict(
      ['resources', 'matches', 'index.ts'],
      ['resources', 'players', 'parts', 'Row.ts'],
      layoutOf,
      entryOf,
    )).toBe('reaches-inside');
  });
});

describe('relativeVerdict · how deep the entry check looks', () => {
  it('refuses a path that reaches through a sibling entry folder', () => {
    // Three segments is the ONLY shape where the third can be the entry file.
    // Dropping the length check lets `../markets/index/deep.ts` pass as an entry
    // import, because segment three happens to read `index` — a path that goes
    // straight through the entry into the module's private interior.
    expect(relativeVerdict(
      ['resources', 'matches', 'Row.ts'],
      ['resources', 'markets', 'index', 'deep.ts'],
      layoutOf,
      entryOf,
    )).toBe('reaches-inside');
  });

  it('matches a dotted entry name against the last extension only', () => {
    // A layer whose entry is `index.d` has `index.d.ts` as its entry FILE — the
    // key drops the final extension, not the first dotted part. Cutting at the
    // first dot compares `index.ts` against `index.d`, and a sibling's legal
    // entry import is reported as reaching inside it.
    const typed: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'types', does: 'shared shapes', layout: 'folder', entry: 'index.d' }],
    };

    expect(relativeVerdict(
      ['types', 'money', 'money.ts'],
      ['types', 'shape', 'index.d.ts'],
      layoutResolver(typed),
      entryResolver(typed),
    )).toBe('ok');
  });
});

describe('relativeVerdict · the implicit module root', () => {
  // The root is the module's own composition code: `Fighter/Fighter.tsx` and
  // `Fighter/index.ts`. It sits above every declared layer and is governed as
  // such — it may reach down through a unit's entry, and nothing inside a
  // layer may reach back up to it.
  const modular: ArchitectureDef = {
    alias: '~app',
    layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    modules: [{ name: 'Fighter', does: 'The player ship.' }],
  };

  const layoutOf = layoutResolver(modular);
  const entryOf = entryResolver(modular);

  const verdict = (own: string[], target: string[]) =>
    relativeVerdict(own, target, layoutOf, entryOf, 1);

  it.each([
    // The four the ticket pins, as segment pairs. Both spellings reach this
    // one function — `analyze` resolves the relative form and `stripAlias` the
    // alias form — so pinning it here pins both.
    ['root reaches a layer unit through its entry',
      ['Fighter', 'Fighter.tsx'], ['Fighter', 'hooks', 'useInput'], 'ok'],
    ['root reaches past that entry',
      ['Fighter', 'Fighter.tsx'], ['Fighter', 'hooks', 'useInput', 'private.ts'], 'reaches-inside'],
    ['a layer unit reaches the root implementation',
      ['Fighter', 'hooks', 'useInput.ts'], ['Fighter', 'Fighter.tsx'], 'reaches-root'],
    ['a layer unit reaches the root entry',
      ['Fighter', 'hooks', 'useInput.ts'], ['Fighter', 'index.ts'], 'reaches-root'],
  ])('%s', (_label, own, target, expected) => {
    expect(verdict(own, target)).toBe(expected);
  });

  it('lets the root talk to itself', () => {
    // `Fighter.tsx` beside `index.ts` is one unit — the module root — not two
    // things with a boundary between them.
    expect(verdict(['Fighter', 'Fighter.tsx'], ['Fighter', 'index.ts'])).toBe('ok');
  });

  it('names the TARGET layer\'s entry when the root reaches too far', () => {
    // The root belongs to no layer, so an entry read off the importer would be
    // whatever `entryOf` defaults to rather than the entry the reader must use.
    const named: ArchitectureDef = {
      ...modular,
      layers: [{ name: 'hooks', does: 'state', layout: 'folder', entry: 'main' }],
    };

    expect(entryResolver(named)('hooks')).toBe('main');

    expect(relativeVerdict(
      ['Fighter', 'Fighter.tsx'],
      ['Fighter', 'hooks', 'useInput', 'main.ts'],
      layoutResolver(named),
      entryResolver(named),
      1,
    )).toBe('ok');
  });

  it('calls crossing a module boundary its own verdict', () => {
    // Not `escapes-src` (it stays inside) and not `leaves-layer` (the layer is
    // the same name) — neither would tell the reader what the fix is.
    expect(verdict(['Fighter', 'hooks', 'useInput.ts'], ['Combat', 'hooks', 'useDamage.ts']))
      .toBe('leaves-module');

    // Including root to root across modules.
    expect(verdict(['Fighter', 'Fighter.tsx'], ['Combat', 'index.ts'])).toBe('leaves-module');
  });

  it('leaves a flat project unmoved at depth 0', () => {
    // The same shapes read flat: `Fighter` IS the layer, so `Fighter/Fighter.tsx`
    // is a unit inside it and none of the modular arms may fire.
    const flat: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'Fighter', does: 'x', layout: 'folder' }],
    };

    const at0 = (own: string[], target: string[]) =>
      relativeVerdict(own, target, layoutResolver(flat), entryResolver(flat), 0);

    expect(at0(['Fighter', 'Ship', 'index.ts'], ['Fighter', 'Hull'])).toBe('ok');

    expect(at0(['Fighter', 'Ship', 'index.ts'], ['Fighter', 'Hull', 'private.ts']))
      .toBe('reaches-inside');

    expect(at0(['Fighter', 'Ship', 'index.ts'], ['hooks', 'useInput'])).toBe('leaves-layer');
  });
});

describe('relativeVerdict · a relative reach into another module', () => {
  it('leaves the module even when the unit names match', () => {
    // The defect the collapsed key hid: both sides keyed `hooks/useInput`, so
    // the equality test answered `ok` before the module check ever ran — in
    // BOTH gates, since they share this function.
    expect(relativeVerdict(
      ['Fighter', 'hooks', 'useInput', 'x.ts'],
      ['Combat', 'hooks', 'useInput', 'y'],
      () => 'folder',
      () => 'index',
      1,
    )).toBe('leaves-module');
  });
});
