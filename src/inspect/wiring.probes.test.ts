import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { ScanResult } from './types';
import { expectedStructural, wiringCheck } from './wiring';

/**
 * Four plain layers and an ignore glob. Every flow declaration the wider fixture
 * in `wiring.test.ts` carries — a second alias, allowedImporters, package
 * ownership, a folder shape, a declared rule tier — is left out: this file asks
 * which files become probes and which carrier gates are expected, and both sides
 * of every comparison here are computed from this same object, so a ban declared
 * on it decides nothing. `alias` stays only because the type demands one.
 */
const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'views', does: 'pages' },
      { name: 'contexts', does: 'shared state' },
      { name: 'stores', does: 'state' },
      { name: 'services', does: 'io' },
    ],
    layerFilesIgnore: 'src/**/*.gen.ts',
  },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

/**
 * A fake project-eslint whose final resolved config is programmable. It cannot
 * be made to throw here — every skip path (an unresolvable config, a broken
 * one, an unwired repo) is `wiring.test.ts`'s, and a parameter this file passes
 * one value to is a branch nothing in it decides.
 */
function loader(resolved: unknown | ((filePath: string) => unknown)) {
  return async (): Promise<unknown> => ({
    ESLint: class {
      async calculateConfigForFile(filePath: string): Promise<unknown> {
        return typeof resolved === 'function' ? resolved(filePath) : resolved;
      }
    },
  });
}

const run = (scanResult: ScanResult, resolved: unknown) =>
  wiringCheck({
    root: '/repo',
    blueprint,
    scanResult,
    wired: true,
    merged: true,
    hasTypescript: true,
    load: loader(resolved),
  });

describe('wiringCheck · carrier gates (field issue #40)', () => {
  // A gate that rides an injected plugin emits NOTHING when the merge drops
  // the argument, and lint stays green because there is no rule left to
  // fail. That is the failure the playbook warns hardest about — and the one
  // this check used to print a ✓ over: a field agent removed `stylistic`
  // from a merged config, watched `npm run lint` and `doctor` both pass, and
  // found the ~68-rule codeStyle family gone only via `eslint --print-config`.
  const gated: Blueprint = {
    ...blueprint,
    rules: {
      fixtureImports: 'error',
      codeStyle: 'error',
      statementPadding: 'error',
      importBlock: 'error',
      explicitAny: 'error',
    },
  };

  const structural = () => {
    const expected = gated.architecture.layers
      .map((layer) => expectedStructural(gated, layer.name));

    return {
      'blueprint/relative-escape': 'error',
      'no-restricted-imports': [2, {
        patterns: [...new Set(expected.flatMap((e) => [...e.groups]))].map((group) => ({
          group: JSON.parse(group) as string[],
        })),
      }],
      'no-restricted-syntax': [2, ...new Set(expected.flatMap((e) => [...e.selectors]))],
      'no-restricted-globals': [2, ...new Set(expected.flatMap((e) => [...e.globals]))],
    } as Record<string, unknown>;
  };

  const check = (rules: Record<string, unknown>, hasTypescript = true) =>
    wiringCheck({
      root: '/repo',
      blueprint: gated,
      scanResult: scanOf('src/views/Home/index.vue'),
      wired: true,
      merged: true,
      hasTypescript,
      load: loader({ rules }),
    });

  const carried = {
    '@stylistic/max-len': 'error',
    '@stylistic/padding-line-between-statements': 'error',
    'import-x/no-duplicates': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
  };

  /** `carried` minus the named carriers — what a merge that dropped an argument resolves to. */
  const carriedWithout = (...dropped: string[]) =>
    Object.fromEntries(Object.entries(carried).filter(([rule]) => !dropped.includes(rule)));

  it('goes red when the merge drops the stylistic argument', async () => {
    // Structural rules all intact — exactly the state that used to pass.
    const rest = carriedWithout(
      '@stylistic/max-len',
      '@stylistic/padding-line-between-statements',
    );

    const result = await check({ ...structural(), ...rest });

    expect(result.ok).toBe(false);

    expect(result.detail).toContain(
      'rules.codeStyle is on but @stylistic/max-len resolved to nothing',
    );

    expect(result.detail).toContain('`stylistic` argument is missing');
    expect(result.detail).toContain('rules.statementPadding is on');
  });

  it('goes red when the merge drops the imports argument', async () => {
    const rest = carriedWithout('import-x/no-duplicates');
    const result = await check({ ...structural(), ...rest });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('rules.importBlock is on but import-x/no-duplicates');
    expect(result.detail).toContain('`imports` argument is missing');
  });

  it('reads severity, not presence — a carrier rule switched off is lost too', async () => {
    const result = await check({ ...structural(), ...carried, '@stylistic/max-len': 'off' });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('rules.codeStyle is on but @stylistic/max-len');
  });

  it('passes when every carrier survived', async () => {
    const result = await check({ ...structural(), ...carried });

    expect(result.ok).toBe(true);
  });

  it('does not expect explicitAny on a JavaScript project', async () => {
    // `any` is a TS construct, so emitLint skips the gate without the TS
    // plugin — doctor must mirror that or every JS repo reds on a gate it
    // could never resolve.
    const rest = carriedWithout('@typescript-eslint/no-explicit-any');

    expect((await check({ ...structural(), ...rest }, false)).ok).toBe(true);
    expect((await check({ ...structural(), ...rest }, true)).ok).toBe(false);
  });

  it('expects nothing when the gates themselves are off', async () => {
    const off = await wiringCheck({
      root: '/repo',
      blueprint,
      scanResult: scanOf('src/views/Home/index.vue'),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader({ rules: structural() }),
    });

    // A repo that keeps its own formatter turns codeStyle off in the config;
    // that is a declared decision, not a dropped argument.
    expect(off.ok).toBe(true);
  });
});

describe('wiringCheck · selfOnly with several importers (field issue #51)', () => {
  // A selfOnly layer emits its re-export ban on EVERY importer layer, so one
  // rule key owns several scoped entries. A house rule that overlaps just one
  // of them tempts a combined entry narrowed to that layer — which, under
  // flat-config replacement, deletes the other importer's ban while lint
  // stays green. The playbook now says so; this proves the gate behind it.
  const twoImporters: Blueprint = {
    ...blueprint,
    architecture: {
      ...blueprint.architecture,
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [
            { layer: 'views', selfOnly: true },
            { layer: 'composables', selfOnly: true },
          ],
        },
        { name: 'composables', does: 'reusable logic' },
        { name: 'services', does: 'io' },
      ],
    },
  };

  it('emits the ban on both importers, not just the first', () => {
    expect(expectedStructural(twoImporters, 'views').selectors.size).toBeGreaterThan(0);
    expect(expectedStructural(twoImporters, 'composables').selectors.size).toBeGreaterThan(0);
  });

  it('names the importer whose ban a narrowed combined entry replaced', async () => {
    const views = expectedStructural(twoImporters, 'views');

    const check = await wiringCheck({
      root: '/repo',
      blueprint: twoImporters,
      scanResult: scanOf('src/views/Home/index.vue', 'src/composables/useThing/index.ts'),
      wired: true,
      merged: true,
      hasTypescript: true,
      // The combined entry covers views and keeps its selectors; composables
      // resolves to a config where the emitted entry was replaced away.
      load: loader((filePath: string) =>
        filePath.includes('composables')
          ? { rules: { 'blueprint/relative-escape': 'error' } }
          : {
              rules: {
                'blueprint/relative-escape': 'error',
                'no-restricted-imports': [2, {
                  patterns: [...views.groups]
                    .map((group) => ({ group: JSON.parse(group) as string[] })),
                }],
                'no-restricted-syntax': [2, ...views.selectors],
                'no-restricted-globals': [2, ...views.globals],
              },
            }),
    });

    expect(check.ok).toBe(false);
    // The layer that lost it is named, so the red is actionable rather than
    // "something somewhere in the merge".
    expect(check.detail).toContain('composables: no-restricted-syntax lost');
    expect(check.detail).not.toContain('views: no-restricted-syntax lost');
  });
});

describe('wiringCheck · which files become probes', () => {
  it('never probes an ignored or a test file', async () => {
    const probed: string[] = [];

    await run(
      scanOf('src/views/skip.gen.ts', 'src/views/Home/x.test.ts', 'src/views/Home/index.vue'),
      (filePath: string) => {
        probed.push(filePath.split(path.sep).join('/'));

        return { rules: {} };
      },
    );

    // layerFilesIgnore covers `*.gen.ts` and testFiles covers `*.test.ts`.
    // Probing either measures a file the emitted config never governs, so the
    // verdict would come from a config that was never in question.
    expect(probed.some((file) => file.includes('skip.gen.ts'))).toBe(false);
    expect(probed.some((file) => file.includes('x.test.ts'))).toBe(false);

    // The real layer file is what gets asked about.
    expect(probed.some((file) => file.includes('Home/index.vue'))).toBe(true);
  });
});

describe('wiringCheck · which path each layer gets probed at', () => {
  const probeWith = async (over: Partial<Blueprint['architecture']>, scanResult: ScanResult) => {
    const probed: string[] = [];

    const check = await wiringCheck({
      root: '/repo',
      blueprint: { ...blueprint, architecture: { ...blueprint.architecture, ...over } },
      scanResult,
      wired: true,
      merged: true,
      hasTypescript: true,
      // Normalised: `calculateConfigForFile` receives a joined absolute path, so
      // on Windows it arrives with backslashes while every glob and module key in
      // this repo is forward-slash. The assertions below are about which FILE was
      // probed, not how the platform spells it.
      load: loader((filePath: string) => {
        probed.push(filePath.split(path.sep).join('/'));

        return { rules: {} };
      }),
    });

    return { probed, check };
  };

  it('takes a file matching ANY of the layer globs, not one matching all', async () => {
    // One glob per extension is the ordinary shape. Requiring a file to match
    // every glob finds no real file at all, so the layer falls back to a
    // synthetic probe — the check then asks about a path that does not exist
    // while the real file sitting in the layer goes unmeasured.
    const { probed } = await probeWith(
      { layerFiles: ['src/{layer}/**/*.ts', 'src/{layer}/**/*.vue'] },
      scanOf('src/views/Home/index.vue'),
    );

    expect(probed.some((file) => file.endsWith('src/views/Home/index.vue'))).toBe(true);
  });

  it('collapses a run of stars into a single probe segment', async () => {
    // `src/{layer}/**` ends on the stars, so they survive the `**/` strip and
    // reach the star replacement as a pair. Replacing one at a time doubles the
    // placeholder: the probe still lands inside the net, so nothing turns red,
    // but the path asked about is not the shape any real file has — and a user
    // entry scoped by path segment resolves differently for it.
    const { probed } = await probeWith({ layerFiles: 'src/{layer}/**' }, scanOf());

    expect(probed.some((file) => file.endsWith('src/views/__blueprint_probe__'))).toBe(true);
    expect(probed.some((file) => file.includes('__blueprint_probe____'))).toBe(false);
  });

  it('walks past a glob synthesis cannot handle to one it can', async () => {
    // `?` survives synthesis untransformed, so that glob yields no candidate —
    // but the layer's other glob still does. Accepting the null stops at the
    // first glob and reports no probe derivable, so a layer that IS measurable
    // goes unmeasured and the whole check skips green.
    const { probed, check } = await probeWith(
      { layerFiles: ['src/{layer}/?.js', 'src/{layer}/**/*.ts'] },
      scanOf(),
    );

    expect(check.label).not.toContain('no probe derivable');
    expect(probed.some((file) => file.endsWith('src/views/__blueprint_probe__.ts'))).toBe(true);
  });
});

describe('wiringCheck · the shapes a surviving global ban comes back as', () => {
  it('reads the object form emitLint itself writes', async () => {
    // emitLint emits `{ name, message }` entries, so a merge that changed
    // nothing hands exactly those back. Taking the whole object as the name
    // compares an object against `fetch` and reports the ban as lost — doctor
    // then reddens the one merge that is completely correct.
    const expected = blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name));

    const groups = new Set(expected.flatMap((e) => [...e.groups]));
    const selectors = new Set(expected.flatMap((e) => [...e.selectors]));
    const globals = new Set(expected.flatMap((e) => [...e.globals]));

    const check = await run(scanOf('src/views/Home/index.vue'), {
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: [...groups].map((group) => ({ group: JSON.parse(group) as string[] })),
        }],
        'no-restricted-syntax': [2, ...selectors],
        'no-restricted-globals': [
          2,
          ...[...globals].map((name) => ({
            name,
            message: `\n🚫 Use of "${name}" is restricted to its owning layer.`,
          })),
        ],
      },
    });

    expect(check.ok).toBe(true);
  });
});

describe('wiringCheck · entries the reader could not make sense of', () => {
  it('stays green but names how many it skipped', async () => {
    // The comparison is by containment on purpose — an entry blueprint does not
    // recognise belongs to the user, and calling it a loss would redden a config
    // that is fine. The cost was silence: a hand-folded entry with a typo in it
    // looked exactly like a deliberate one, and this check reported neither.
    const expected = blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name));

    const groups = new Set(expected.flatMap((e) => [...e.groups]));
    const selectors = new Set(expected.flatMap((e) => [...e.selectors]));
    const globals = new Set(expected.flatMap((e) => [...e.globals]));

    const check = await run(scanOf('src/views/Home/index.vue'), {
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: [
            ...[...groups].map((group) => ({ group: JSON.parse(group) as string[] })),
            // Four unreadable shapes: a pattern with no group at all, one whose
            // group is a bare string rather than a list, a plain string entry, and
            // a null slot — the one a hand-folded config leaves behind after a
            // deleted entry, and the one that makes the difference between reading
            // `group` through `?.` and crashing the whole doctor run on it.
            { message: 'no group here' },
            { group: '~app/legacy/**' },
            'a bare string pattern',
            null,
          ],
        }],
        'no-restricted-syntax': [2, ...selectors, { message: 'no selector' }],
        'no-restricted-globals': [2, ...globals, { message: 'no name' }],
      },
    });

    // Everything expected survived, so the verdict is still green.
    expect(check.ok).toBe(true);

    // The exact count, not just "some": six unreadable entries per probe (four
    // patterns, one selector, one global) across four probes. A range or a regex
    // here would let a reader that quietly stops counting one of the three rules
    // pass, which is the failure the count exists to make visible.
    expect(check.detail).toContain('24 restricted-import/syntax/globals entries');
    expect(check.detail).toContain('could not be read by this check');
    expect(check.detail).toContain('a typo in one would not surface here');
  });

  it('agrees with itself about one', async () => {
    // Plural agreement is the whole signal for how many entries the reader is
    // telling you about. Only one probe's config carries the unreadable entry, so
    // the count really is 1 rather than one-per-probe.
    const expected = blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name));

    const groups = [...new Set(expected.flatMap((e) => [...e.groups]))];
    const selectors = new Set(expected.flatMap((e) => [...e.selectors]));
    const globals = new Set(expected.flatMap((e) => [...e.globals]));

    const survived = (extra: unknown[]) => ({
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: [
            ...groups.map((group) => ({ group: JSON.parse(group) as string[] })),
            ...extra,
          ],
        }],
        'no-restricted-syntax': [2, ...selectors],
        'no-restricted-globals': [2, ...globals],
      },
    });

    const check = await run(
      scanOf('src/views/Home/index.vue'),
      (filePath: string) => (
        filePath.includes('views') ? survived([{ message: 'no group' }]) : survived([])
      ),
    );

    expect(check.ok).toBe(true);
    expect(check.detail).toContain('1 restricted-import/syntax/globals entry ');
    expect(check.detail).not.toContain('entries');
  });

  it('says nothing when every entry read cleanly', async () => {
    // The note has to be absent, not empty: a green check with a blank detail line
    // reads as an explanation doctor failed to print.
    const expected = blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name));

    const check = await run(scanOf('src/views/Home/index.vue'), {
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: new Set(expected.flatMap((e) => [...e.groups])).size === 0
            ? []
            : [...new Set(expected.flatMap((e) => [...e.groups]))]
                .map((group) => ({ group: JSON.parse(group) as string[] })),
        }],
        'no-restricted-syntax': [2, ...new Set(expected.flatMap((e) => [...e.selectors]))],
        'no-restricted-globals': [2, ...new Set(expected.flatMap((e) => [...e.globals]))],
      },
    });

    expect(check.ok).toBe(true);
    expect(check.detail).toBeUndefined();
  });
});
