import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import {
  entryResolver,
  layoutResolver,
  moduleKey,
  resolveSegments,
  sourceRootName,
  stripAlias,
  stripSourceRoot,
} from './resolve';

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

describe('stripSourceRoot', () => {
  const LAYERS = ['components', 'services'];

  it('counts from the configured root, whatever that root is', () => {
    expect(stripSourceRoot('/repo/src/components/Button.ts', 'src', LAYERS))
      .toEqual(['components', 'Button.ts']);

    // The two roots a `src` search answered null for. Null is what makes the
    // calling rule register no visitor at all, so both of these were green lint
    // on a project `inspect` reports — `lib/app` here, and the project root
    // below, which is what `nextPreset` emits without `srcDir`.
    expect(stripSourceRoot('/repo/lib/app/components/Button.ts', 'lib/app', LAYERS))
      .toEqual(['components', 'Button.ts']);

    expect(stripSourceRoot('/repo/components/Button.ts', '.', LAYERS))
      .toEqual(['components', 'Button.ts']);
  });

  it('reads a repeat of the root inside the tree as a directory, not as the root', () => {
    // `lastIndexOf('src')` took the deepest run: coordinates of `['Foo.ts']`,
    // no layer at position 0, and the rule declines on a `src`-rooted project —
    // the one shape a fix here could regress.
    expect(stripSourceRoot('/repo/src/components/src/Foo.ts', 'src', LAYERS))
      .toEqual(['components', 'src', 'Foo.ts']);

    // The same folder under a moved root: `src` there is a unit path and names
    // nothing about where the coordinates start.
    expect(stripSourceRoot('/repo/lib/app/components/src/Foo.ts', 'lib/app', LAYERS))
      .toEqual(['components', 'src', 'Foo.ts']);
  });

  it('skips a run of the root that lands on no declared layer', () => {
    // `~/src/` as the checkout directory is an ordinary developer layout, which
    // puts a run of the root ABOVE the project. Anchoring there makes `proj` the
    // layer and silences the rule on a project that has always been governed —
    // the failure the outermost-first search would have if it did not also test
    // the layer.
    expect(stripSourceRoot('/home/dev/src/proj/src/components/Card.ts', 'src', LAYERS))
      .toEqual(['components', 'Card.ts']);
  });

  it('answers null where it cannot place a declared layer', () => {
    // Outside the root entirely…
    expect(stripSourceRoot('/repo/scripts/build.ts', 'src', LAYERS)).toBeNull();

    // …under the root but in a folder no layer claims…
    expect(stripSourceRoot('/repo/src/utils/helper.ts', 'src', LAYERS)).toBeNull();

    // …and the root itself, which has no segment after it to name a layer.
    expect(stripSourceRoot('/repo/src', 'src', LAYERS)).toBeNull();
  });

  it('reads the layer one segment down under modules', () => {
    expect(stripSourceRoot('/repo/src/Fighter/components/Ship/index.ts', 'src', LAYERS, 1))
      .toEqual(['Fighter', 'components', 'Ship', 'index.ts']);

    // The same path read flat: `Fighter` is where the layer would sit, no layer
    // claims it, and the answer is null rather than a guess one segment over.
    expect(stripSourceRoot('/repo/src/Fighter/components/Ship/index.ts', 'src', LAYERS))
      .toBeNull();
  });

  it.each(['./src', 'src/', 'src//'])('reads "%s" as the root `src` names', (root) => {
    // Every one of these reaches the emitters as written — `aliasPaths` is
    // asserted on `src//` — so parsing the value a second time here is how the
    // alias offset and the layer root come to strip a different number of
    // segments from the same config.
    expect(stripSourceRoot('/repo/src/components/Button.ts', root, LAYERS))
      .toEqual(['components', 'Button.ts']);
  });

  it('survives the separators a real filename arrives with', () => {
    // ESLint hands the rule the platform's own path, and a doubled separator is
    // a routine typo. An empty segment lands where the layer name goes, and a
    // backslash-only split leaves the whole Windows path as one segment — both
    // present as the file having no layer at all.
    expect(stripSourceRoot('C:\\repo\\src\\components\\Button.ts', 'src', LAYERS))
      .toEqual(['components', 'Button.ts']);

    expect(stripSourceRoot('/repo/src//components/Button.ts', 'src', LAYERS))
      .toEqual(['components', 'Button.ts']);
  });
});

describe('sourceRootName', () => {
  // One row per shape a config can hold, because the message that reads this is
  // the only thing an adopting agent is guaranteed to see, and a root it does
  // not have reads as the tool being broken rather than the import being wrong.
  it.each([
    ['src', 'src/'],
    ['app', 'app/'],
    ['lib/app', 'lib/app/'],
    // No directory to cite, so the name is the concept — the spelling
    // `report.ts`'s remedy for the same finding already uses.
    ['.', 'the source root'],
    ['', 'the source root'],
    ['./', 'the source root'],
    // The spellings `stripSourceRoot` normalises: naming what the config typed
    // rather than what the comparator matched puts a `./` in front of a
    // directory the scan reports without one.
    ['./app', 'app/'],
    ['src/', 'src/'],
  ])('names %o as %o', (sourceRoot, expected) => {
    expect(sourceRootName(sourceRoot)).toBe(expected);
  });

  it('names the root the comparator matched, on every spelling of one root', () => {
    // The pin that makes the rows above load-bearing rather than a restatement
    // of the implementation: these four spellings resolve to the SAME
    // coordinates, so they have to reach the reader under the same name. Read
    // the config string directly instead and this is where the two diverge.
    const spellings = ['src', './src', 'src/', 'src//'];

    for (const spelling of spellings) {
      expect(stripSourceRoot('/repo/src/components/Button.ts', spelling, ['components', 'services']))
        .toEqual(['components', 'Button.ts']);
    }

    expect(spellings.map(sourceRootName)).toEqual(['src/', 'src/', 'src/', 'src/']);
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
    expect(moduleKey(['views', 'Home.vue'], () => 'file')).toBe('views');
  });
});
