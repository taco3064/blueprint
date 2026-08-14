import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import {
  entryResolver,
  layoutResolver,
  moduleKey,
  relativeVerdict,
  resolveSegments,
  stripAlias,
  targetModuleKey,
} from './resolve';
import type { ImportRef, ScannedFile } from './types';

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

describe('entryResolver', () => {
  it('takes the shared entry, and a layer override where declared', () => {
    expect(entryOf('resources')).toBe('index');
    expect(entryOf('services')).toBe('service');
  });

  it('falls back to the shared entry for a layer it does not know', () => {
    // The rule receives its layer map as options, which can lag a config
    // edit; an unknown layer must still yield an answer rather than throw.
    expect(entryOf('not-a-layer')).toBe('index');
  });
});

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

describe('resolveSegments', () => {
  const dir = ['resources', 'matches'];

  it('drops the parts that address nothing, rather than pushing them as folders', () => {
    // `./x` is the most ordinary relative spelling there is, and `a//b` is a
    // routine typo. A `.` or an empty string pushed onto the stack becomes a
    // phantom folder, and every later layer/entry comparison reads the wrong
    // segment — silently, since the path still looks plausible.
    expect(resolveSegments(dir, './Row.ts')).toEqual(['resources', 'matches', 'Row.ts']);

    expect(resolveSegments(dir, './parts/Cell.ts'))
      .toEqual(['resources', 'matches', 'parts', 'Cell.ts']);

    expect(resolveSegments(dir, 'parts//Cell.ts'))
      .toEqual(['resources', 'matches', 'parts', 'Cell.ts']);
  });

  it('walks up on .., and gives up rather than climbing past the root', () => {
    expect(resolveSegments(dir, '../markets/index.ts'))
      .toEqual(['resources', 'markets', 'index.ts']);

    expect(resolveSegments([], '../outside')).toBeNull();
  });
});

describe('entryResolver · an entry that is not the default', () => {
  it('keeps each layer\'s declared entry instead of falling back to index', () => {
    // `index` is only what a layer gets when it declares nothing. A layer that
    // names its entry `main` has no `index` files at all, so resolving to one
    // makes every sibling import a reaches-inside violation and inspect reddens
    // a repo that is correctly shaped.
    const named = entryResolver({
      alias: '~app',
      layers: [
        { name: 'features', does: 'x', layout: 'folder', entry: 'main' },
        { name: 'api', does: 'y', layout: 'folder', entry: 'client' },
        { name: 'lib', does: 'z' },
      ],
    });

    expect(named('features')).toBe('main');
    expect(named('api')).toBe('client');
    expect(named('lib')).toBe('index'); // declares neither key
    expect(named('unknown')).toBe('index'); // and so does an undeclared layer
  });
});

describe('stripAlias', () => {
  it('reads the bare alias as the alias root itself', () => {
    // `import x from '~app'` is the alias with nothing after it. Requiring a
    // trailing slash makes it not-an-alias-import at all, and the specifier
    // falls through to "unresolvable" — invisible to every structural check
    // while emitLint still bans it (field issue #29).
    expect(stripAlias('~app', ['~app'])).toEqual([]);
    expect(stripAlias('~app/services/api', ['~app'])).toEqual(['services', 'api']);
  });

  it('refuses a specifier that leaves the alias offset', () => {
    // `~root` points at the project root, so its layer segments sit under
    // `src/`. `~root/package.json` is under the alias but outside the offset —
    // reading `package` as the layer name is how the naive strip turned a
    // manifest import into a phantom layer (field issue #29).
    const root = [{ alias: '~root', prefix: ['src'] }];

    expect(stripAlias('~root/src/views/x', root)).toEqual(['views', 'x']);
    expect(stripAlias('~root/package.json', root)).toBeNull();
    // Matching only the FIRST offset segment is not enough either.
    expect(stripAlias('~root/srcx/views/x', root)).toBeNull();
  });

  it('answers null for a specifier under no alias at all', () => {
    expect(stripAlias('axios', ['~app'])).toBeNull();
  });
});

describe('moduleKey · dropping the extension', () => {
  it('drops only the last extension, not the first dotted part', () => {
    // `Row.stories.ts` belongs to the module `Row.stories` — the file IS the
    // module under folder layout. Cutting at the first dot yields `Row.ts`,
    // which is a different module and a file that does not exist.
    expect(moduleKey(['resources', 'Row.stories.ts'], layoutOf)).toBe('resources/Row.stories');
    expect(moduleKey(['resources', 'Row.ts'], layoutOf)).toBe('resources/Row');
  });
});

describe('targetModuleKey · which specifiers name a module', () => {
  const file = (segments: string[]): ScannedFile => ({ path: segments.join('/'), segments, imports: [] });
  const ref = (specifier: string): ImportRef => ({ specifier, names: [], isExport: false });

  it('answers null for a bare package specifier', () => {
    // A package name is neither aliased nor relative. Resolving it like a
    // relative path appends it to the importer's own folder, and `axios` becomes
    // the module `resources/axios` — a graph edge to a module that is not there,
    // counted in every blast radius and flow check.
    expect(
      targetModuleKey(ref('axios'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBeNull();

    // The two shapes that DO name a module still do.
    expect(
      targetModuleKey(ref('./parts/Cell'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBe('resources/Row');

    expect(
      targetModuleKey(ref('~app/services/api'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['services'], layoutOf),
    ).toBe('services/api');
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

describe('moduleKey · the module segment is part of the key', () => {
  const folder = () => 'folder' as const;

  it('keeps two modules\' same-named units apart', () => {
    // Collapsed, `detectCycles` reports a cycle nobody wrote and
    // `relativeVerdict` calls a cross-module reach `ok` — one dropped segment,
    // a fabricated finding in one gate and a missing one in the other.
    expect(moduleKey(['Fighter', 'hooks', 'useInput', 'x.ts'], folder, 1))
      .toBe('Fighter/hooks/useInput');

    expect(moduleKey(['Combat', 'hooks', 'useInput', 'y.ts'], folder, 1))
      .toBe('Combat/hooks/useInput');
  });

  it('keys a module entry and its root files to the feature itself', () => {
    // `~app/Combat` and `Fighter/index.ts` both address the whole module —
    // the node its entry stands for.
    expect(moduleKey(['Combat'], folder, 1)).toBe('Combat');
    expect(moduleKey(['Fighter', 'index.ts'], folder, 1)).toBe('Fighter');
  });

  it('leaves a flat project\'s keys exactly as they were', () => {
    expect(moduleKey(['hooks', 'useCart', 'useCart.ts'], folder)).toBe('hooks/useCart');
    expect(moduleKey(['hooks'], folder)).toBe('hooks');
    expect(moduleKey([], folder)).toBe('');
    expect(moduleKey(['views', 'Home.vue'], () => 'flat')).toBe('views');
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

describe('targetModuleKey · both spellings of one target', () => {
  const ref = (specifier: string) => ({ specifier, names: [], isExport: false });

  const from = {
    path: 'src/Fighter/hooks/useInput/useInput.ts',
    segments: ['Fighter', 'hooks', 'useInput', 'useInput.ts'],
    imports: [],
  };

  it('lands the alias and the relative form on one node', () => {
    // Given the offset to one arm only, the same file becomes two nodes and
    // the graph disagrees with itself about what a segment is.
    const alias = targetModuleKey(ref('~app/Combat'), from, ['~app'], ['hooks'], () => 'folder', 1);
    const rel = targetModuleKey(ref('../../../Combat'), from, ['~app'], ['hooks'], () => 'folder', 1);

    expect(alias).toBe('Combat');
    expect(rel).toBe('Combat');
  });

  it('reads a unit inside another module at the same offset', () => {
    expect(targetModuleKey(
      ref('~app/Combat/hooks/useDamage'), from, ['~app'], ['hooks'], () => 'folder', 1,
    )).toBe('Combat/hooks/useDamage');
  });

  it('keeps a flat project\'s answers', () => {
    const flat = { path: 'src/views/Home.ts', segments: ['views', 'Home.ts'], imports: [] };

    expect(targetModuleKey(ref('~app/hooks/useCart'), flat, ['~app'], ['hooks'], () => 'folder'))
      .toBe('hooks/useCart');

    // Not a declared layer — invisible to the graph, as it always was.
    expect(targetModuleKey(ref('~app/nope/x'), flat, ['~app'], ['hooks'], () => 'folder'))
      .toBeNull();
  });
});

describe('targetModuleKey · the alias root itself', () => {
  it('is not a node on a flat project', () => {
    // `~app` alone reaches the source root, which is not a layer and not a
    // module. The module-entry arm is guarded on depth for exactly this: read
    // without it, a bare alias becomes an empty-keyed node in every flat graph.
    const flat = { path: 'src/views/Home.ts', segments: ['views', 'Home.ts'], imports: [] };

    expect(targetModuleKey(
      { specifier: '~app', names: [], isExport: false },
      flat, ['~app'], ['views'], () => 'folder',
    )).toBeNull();
  });
});
