import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { entryResolver, layoutResolver, moduleKey, resolveSegments, stripAlias } from './resolve';

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

describe('entryResolver · a shared entry that is not the default', () => {
  it('keeps the declared shared entry instead of falling back to index', () => {
    // `index` is only what a blueprint gets when it declares nothing. A repo
    // that names its entry `main` has no `index` files at all, so resolving to
    // one makes every sibling import a reaches-inside violation and inspect
    // reddens a repo that is correctly shaped.
    const named = entryResolver({
      alias: '~app',
      module: { layout: 'folder', entry: 'main' },
      layers: [{ name: 'features', does: 'x' }, { name: 'api', does: 'y', module: { entry: 'client' } }],
    });

    expect(named('features')).toBe('main'); // shared, no override
    expect(named('api')).toBe('client'); // override still wins
    expect(named('unknown')).toBe('main'); // and the fallback is the shared one
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
