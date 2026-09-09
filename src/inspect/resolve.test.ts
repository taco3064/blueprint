import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import {
  entryResolver,
  layoutResolver,
  normalizedUnitKey,
  relativeVerdict,
  resolveSegments,
  stripAlias,
  targetUnitKey,
  unitKey,
} from './resolve';
import type { ImportRef, ScannedFile } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  layers: [
    { name: 'resources', does: 'feature units', layout: 'folder', entry: 'index' },
    { name: 'services', does: 'io', layout: 'folder', entry: 'service' },
    { name: 'utils', does: 'leaf helpers', layout: 'file' },
  ],
};

const layoutOf = layoutResolver(architecture);
const entryOf = entryResolver(architecture);
const shape = { layoutOf, entryOf };

describe('entryResolver', () => {
  it('takes each layer entry where declared', () => {
    expect(entryOf('resources')).toBe('index');
    expect(entryOf('services')).toBe('service');
  });

  it('falls back to the default entry for a layer it does not know', () => {
    // The rule receives its layer map as options, which can lag a config
    // edit; an unknown layer must still yield an answer rather than throw.
    expect(entryOf('not-a-layer')).toBe('index');
  });
});

describe('relativeVerdict', () => {
  const own = ['resources', 'matches', 'Row.ts'];

  it('allows anything inside the importer own unit', () => {
    expect(relativeVerdict(own, ['resources', 'matches', 'parts', 'Cell.ts'], shape))
      .toBe('ok');
  });

  it('allows a sibling by its entry, folder or explicit file', () => {
    expect(relativeVerdict(own, ['resources', 'markets'], shape)).toBe('ok');

    expect(
      relativeVerdict(own, ['resources', 'markets', 'index.ts'], shape),
    ).toBe('ok');
  });

  it('honours a layer own entry name', () => {
    const inServices = ['services', 'api', 'client.ts'];

    expect(relativeVerdict(inServices, ['services', 'feed', 'service.ts'], shape))
      .toBe('ok');

    expect(relativeVerdict(inServices, ['services', 'feed', 'index.ts'], shape))
      .toBe('reaches-inside');
  });

  it('refuses to reach past a sibling entry', () => {
    expect(relativeVerdict(own, ['resources', 'markets', 'parts', 'Cell.ts'], shape))
      .toBe('reaches-inside');
  });

  it('refuses to leave the layer, and reports an unresolvable target', () => {
    expect(relativeVerdict(own, ['services', 'api'], shape)).toBe('leaves-layer');
    expect(relativeVerdict(own, null, shape)).toBe('escapes-src');
  });

  it('preserves flat-layout relative freedom inside a file-layout layer', () => {
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'money.ts'], shape))
      .toBe('ok');

    // File layout keeps the former flat-layout boundary: the whole layer is one
    // relative-import scope.
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'sub', 'helper.ts'], shape))
      .toBe('ok');

    // …while the same shape under a FOLDER layer is exactly what is banned.
    expect(relativeVerdict(
      ['resources', 'matches', 'index.ts'],
      ['resources', 'players', 'parts', 'Row.ts'],
      shape,
    )).toBe('reaches-inside');
  });

  it('rejects cross-module relatives even when the layer name matches', () => {
    expect(relativeVerdict(
      ['auth', 'resources', 'matches', 'index.ts'],
      ['shop', 'resources', 'markets', 'parts', 'Row.ts'],
      { ...shape, moduleFirst: true },
    )).toBe('leaves-layer');
  });

  it('still enforces layer and entry boundaries inside one outer module', () => {
    expect(relativeVerdict(
      ['auth', 'resources', 'matches', 'index.ts'],
      ['auth', 'services', 'api', 'index.ts'],
      { ...shape, moduleFirst: true },
    )).toBe('leaves-layer');

    expect(relativeVerdict(
      ['auth', 'resources', 'matches', 'index.ts'],
      ['auth', 'resources', 'markets', 'parts', 'Row.ts'],
      { ...shape, moduleFirst: true },
    )).toBe('reaches-inside');
  });
});

describe('normalizedUnitKey', () => {
  it('normalizes the source root itself to the empty graph key', () => {
    expect(normalizedUnitKey('src', architecture)).toBe('');
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

describe('entryResolver · per-layer entries', () => {
  it('keeps each declared entry and uses index only for an unknown layer', () => {
    // `index` is only what a blueprint gets when it declares nothing. A repo
    // that names its entry `main` has no `index` files at all, so resolving to
    // one makes every sibling import a reaches-inside violation and inspect
    // reddens a repo that is correctly shaped.
    const named = entryResolver({
      alias: '~app',
      layers: [
        { name: 'features', does: 'x', layout: 'folder', entry: 'main' },
        { name: 'api', does: 'y', layout: 'folder', entry: 'client' },
      ],
    });

    expect(named('features')).toBe('main');
    expect(named('api')).toBe('client');
    expect(named('unknown')).toBe('index');
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

  it('places an alias targeting one layer back under that layer', () => {
    const roots = [{ alias: '~shared', prefix: [], prepend: ['shared'] }];

    expect(stripAlias('~shared/api/client', roots)).toEqual(['shared', 'api', 'client']);
  });

  it('answers null for a specifier under no alias at all', () => {
    expect(stripAlias('axios', ['~app'])).toBeNull();
  });
});

describe('unitKey · dropping the extension', () => {
  it('drops only the last extension, not the first dotted part', () => {
    // `Row.stories.ts` belongs to the folder unit `Row.stories` when used as a
    // direct target key. Cutting at the first dot yields `Row.ts`,
    // which is a different unit and a file that does not exist.
    expect(unitKey(['resources', 'Row.stories.ts'], layoutOf)).toBe('resources/Row.stories');
    expect(unitKey(['resources', 'Row.ts'], layoutOf)).toBe('resources/Row');
  });
});

describe('targetUnitKey · which specifiers name a unit', () => {
  const file = (segments: string[]): ScannedFile => ({
    path: segments.join('/'),
    segments,
    imports: [],
  });

  const ref = (specifier: string): ImportRef => ({ specifier, names: [], isExport: false });

  it('answers null for a bare package specifier', () => {
    // A package name is neither aliased nor relative. Resolving it like a
    // relative path appends it to the importer's own folder, and `axios` becomes
    // the unit `resources/axios` — a graph edge to a unit that is not there,
    // counted in every blast radius and flow check.
    expect(
      targetUnitKey(
        ref('axios'),
        file(['resources', 'Row', 'Row.ts']),
        architecture,
      ),
    ).toBeNull();

    // The two shapes that DO name a module still do.
    expect(
      targetUnitKey(
        ref('./parts/Cell'),
        file(['resources', 'Row', 'Row.ts']),
        architecture,
      ),
    ).toBe('resources/Row');

    expect(
      targetUnitKey(
        ref('~app/services/api'),
        file(['resources', 'Row', 'Row.ts']),
        architecture,
      ),
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
      shape,
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
      { layoutOf: layoutResolver(typed), entryOf: entryResolver(typed) },
    )).toBe('ok');
  });
});
