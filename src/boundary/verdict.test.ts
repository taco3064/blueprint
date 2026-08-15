import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { entryResolver, layoutResolver } from './resolve';
import { relativeVerdict } from './verdict';

const architecture: ArchitectureDef = {
  alias: '~app',
  module: { layout: 'folder', entry: 'index' },
  layers: [
    { name: 'resources', does: 'feature modules' },
    { name: 'services', does: 'io', module: { entry: 'service' } },
    { name: 'utils', does: 'leaf helpers', module: { layout: 'flat' } },
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

    expect(relativeVerdict(own, ['resources', 'markets', 'index.ts'], layoutOf, entryOf))
      .toBe('ok');
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

  it('leaves a flat layer alone — it has no module folders to be inside of', () => {
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'money.ts'], layoutOf, entryOf))
      .toBe('ok');

    // The DEEP case, and the invariant this function's shape rests on: a flat
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
      module: { layout: 'folder', entry: 'index' },
      layers: [{ name: 'types', does: 'shared shapes', module: { entry: 'index.d' } }],
    };

    expect(relativeVerdict(
      ['types', 'money', 'money.ts'],
      ['types', 'shape', 'index.d.ts'],
      layoutResolver(typed),
      entryResolver(typed),
    )).toBe('ok');
  });
});
