import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary. The modular probe below has to resolve the REAL emitted entries,
// because a paraphrase of them would agree with the expectations by
// construction and prove nothing about either.
import { emitLint } from '../emit/lint';
import { globToRegExp } from './filter';
import type { ScanResult } from './types';
import { expectedStructural, wiringCheck } from './wiring';

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    additionalAliases: { '~root': 'src' },
    layers: [
      { name: 'views', does: 'pages', layout: 'folder' },
      {
        name: 'contexts',
        does: 'shared state',
        layout: 'folder',
        allowedImporters: [{ layer: 'views', selfOnly: true }],
      },
      { name: 'stores', does: 'state', layout: 'folder', allowedImporters: ['contexts'] },
      { name: 'services', does: 'io', owns: [{ global: 'fetch' }], layout: 'folder' },
    ],
    layerFilesIgnore: 'src/**/*.gen.ts',
  },
  rules: { fixtureImports: 'error' },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

/** A fake project-eslint whose final resolved config is programmable. */
function loader(
  resolved: unknown | ((filePath: string) => unknown),
  throwOn?: 'load' | 'calculate',
) {
  return async (): Promise<unknown> => {
    if (throwOn === 'load') throw new Error('unresolvable');

    return {
      ESLint: class {
        async calculateConfigForFile(filePath: string): Promise<unknown> {
          if (throwOn === 'calculate') throw new Error('broken config');

          return typeof resolved === 'function' ? resolved(filePath) : resolved;
        }
      },
    };
  };
}

const run = (
  scanResult: ScanResult,
  resolved: unknown,
  throwOn?: 'load' | 'calculate',
  merged = true,
) =>
  wiringCheck({
    root: '/repo',
    blueprint,
    scanResult,
    wired: true,
    merged,
    hasTypescript: true,
    load: loader(resolved, throwOn),
  });

describe('expectedStructural · the shape two prose sites describe', () => {
  it('is the authority two prose sites describe, so its shape is a tripwire', () => {
    // What this check compares is stated in two places that are not code: `SCOPE` in
    // wiring.ts (printed on the ✓) and the per-layer block of `blueprint rules`. They
    // disagreed about package ownership for several releases — `rules` claimed
    // "everything below is what doctor compares" over a block that prints a `packages`
    // column this function has never returned (field run #159). The conformance case
    // pins the two texts to each other; this pins them to the thing that decides.
    //
    // Adding a key here means doctor started comparing something new: update `SCOPE`,
    // update `PACKAGES_NOT_COMPARED` and the `rules` block that prints it, then this
    // list. Removing one means it stopped. Either way both texts move with it.
    expect(Object.keys(expectedStructural(blueprint, 'views')))
      .toEqual(['paths', 'groups', 'selectors', 'globals']);
  });
});

describe('wiringCheck', () => {
  it('passes when every layer\'s structural artifacts survive the merge', async () => {
    // Two layers hold files, two probe synthetically — four probes against
    // one merged config, so it must carry the union of every expectation.
    const expected = blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name));

    const groups = new Set(expected.flatMap((e) => [...e.groups]));
    const selectors = new Set(expected.flatMap((e) => [...e.selectors]));
    const globals = new Set(expected.flatMap((e) => [...e.globals]));

    const check = await run(
      // Test and ignored files must not become probes.
      scanOf(
        'src/views/Home/x.test.ts',
        'src/views/skip.gen.ts',
        'src/views/Home/index.vue',
        'src/contexts/user/index.ts',
      ),
      {
        rules: {
          // Bare-string severity — the non-array shape of an active rule.
          'blueprint/relative-escape': 'error',
          'no-restricted-imports': [2, {
            patterns: [...groups].map((group) => ({
              group: JSON.parse(group) as string[],
              message: 'restated by the user, message drift is fine',
            })),
          }],
          // User keeps their own selector next to blueprint's — containment,
          // not equality: extra entries are the user's business.
          'no-restricted-syntax': [2, ...selectors, 'CallExpression[callee.name=Date]'],
          // Bare-string globals — the other shape the resolver must read.
          'no-restricted-globals': [2, ...globals],
        },
      },
    );

    // The ✓ states its own scope — an unqualified one reads as "every emitted
    // rule is alive", which this check cannot promise (field issue #40).
    expect(check.ok).toBe(true);
    expect(check.label).toContain('emitted rules survive the merged eslint config');
    expect(check.label).toContain('thresholds, package-ownership entries, and a merged entry');

    // …including its reach. One probe per layer, so a merged entry covering part of a
    // layer passes on a sibling path — stated where the ✓ is read, not only in the
    // comment on `pickProbes`.
    expect(check.label).toContain('one probe per layer');
    expect(check.label).toContain('scoped to only part of a layer are not compared');
  });

  it('probes every layer — a scoped override cannot hide behind the first one', async () => {
    const views = expectedStructural(blueprint, 'views');

    const survived = {
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: [...views.groups].map((group) => ({ group: JSON.parse(group) as string[] })),
        }],
        'no-restricted-syntax': [2, ...views.selectors],
        'no-restricted-globals': [2, ...views.globals],
      },
    };

    // The user's entry guts only `src/services/**` — views alone looks fine.
    const check = await run(
      scanOf('src/views/Home/index.vue', 'src/services/api/index.ts'),
      (filePath: string) => (filePath.includes('services') ? { rules: {} } : survived),
    );

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('services: no-restricted-imports lost');
    expect(check.detail).not.toContain('views:');
  });

  it('names every loss when a later entry replaced the managed rules', async () => {
    const check = await run(
      // views holds no source file — the probe walks on to services.
      scanOf('src/services/api/index.ts'),
      {
        rules: {
          // String patterns (the user's) carry no group — ignored, so the
          // structural groups count as lost.
          'no-restricted-imports': [2, { patterns: ['~app/legacy/**'] }],
          'no-restricted-syntax': [2, 'CallExpression[callee.name=Date]'],
          // Severity off = as good as gone.
          'no-restricted-globals': ['off', { name: 'fetch' }],
        },
      },
    );

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('services: no-restricted-imports lost');
    expect(check.detail).toContain('structural pattern group(s)');
    expect(check.detail).toContain('services: blueprint/relative-escape is missing or off');
    expect(check.detail).toContain('ONE');
    // services OWNS fetch — no global ban is expected for its own layer
    // (other layers, probed synthetically, do lose it).
    expect(check.detail).not.toContain('services: no-restricted-globals');
    expect(check.detail).toContain('views: no-restricted-globals lost fetch');
  });

  it('reads a numeric 0 severity exactly as it reads "off"', async () => {
    // eslint accepts both spellings for the same thing. Reading the number as
    // active makes this check expect artifacts from a rule the user switched
    // off, and the red then names a rule nobody asked to run.
    const check = await run(scanOf('src/views/Home/index.vue'), {
      rules: { 'no-restricted-globals': [0, { name: 'fetch' }] },
    });

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('views: no-restricted-globals lost fetch');
  });

  it('reports lost selfOnly selectors and globals for a non-owning layer', async () => {
    const check = await run(scanOf('src/views/Home/index.vue'), { rules: {} });

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('selfOnly selector(s)');
    expect(check.detail).toContain('no-restricted-globals lost fetch');
  });

  it('handles a config resolution that returns nothing', async () => {
    const check = await run(scanOf('src/views/Home/index.vue'), undefined);

    expect(check.ok).toBe(false);
  });

  it('tolerates foreign option shapes without counting them as survivors', async () => {
    const check = await run(scanOf('src/views/Home/index.vue'), {
      rules: {
        // paths-only option, null entries, objects missing the marker keys —
        // all the shapes a hand-written config can throw at the reader.
        'no-restricted-imports': [2, { paths: ['lodash'] }, null],
        'no-restricted-syntax': [2, { message: 'no selector here' }, null],
        'no-restricted-globals': [2, { message: 'no name' }, null],
        'blueprint/relative-escape': [2, { layouts: {} }],
      },
    });

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('structural pattern group(s)');
    // The escape rule is present and active — not among the losses.
    expect(check.detail).not.toContain('relative-escape');
  });

  it('skips honestly instead of failing on unreachable preconditions', async () => {
    const unwired = await wiringCheck({
      root: '/repo',
      blueprint,
      scanResult: scanOf('src/views/Home/index.vue'),
      wired: false,
      merged: true,
      hasTypescript: true,
      load: loader({}),
    });

    expect(unwired).toMatchObject({ ok: true });
    expect(unwired.label).toContain('skipped — eslint not wired');

    const unloadable = await run(scanOf('src/views/Home/index.vue'), {}, 'load');

    expect(unloadable.ok).toBe(true);
    expect(unloadable.label).toContain('could not resolve the merged config');

    const broken = await run(scanOf('src/views/Home/index.vue'), {}, 'calculate');

    expect(broken.ok).toBe(true);
    expect(broken.label).toContain('could not resolve the merged config');

    // And WHY, in the skip itself. "would not resolve" is the same swallow as
    // `impact`'s carrier loader: three runs went to `npm run lint` to learn which
    // package was missing, and doctor is the channel they reach after interrupting
    // the install that would have provided it (field runs #145, #148, #149).
    expect(unloadable.skipped).toContain('unresolvable');
    expect(broken.skipped).toContain('broken config');
    expect(broken.skipped).toContain('missing from `package.json`');
  });

  it('calls the config generated when nothing was merged into it', async () => {
    // The label was hardcoded "merged", and on the path where init writes the live
    // config itself there is no merge — an agent read the word against its own repo
    // and had to go verify the check was pointed at the right file (field run #148).
    const generated = await run(scanOf('src/views/Home/index.vue'), {}, undefined, false);

    expect(generated.label).toContain('emitted rules survive the generated eslint config');
    expect(generated.label).not.toContain('merged eslint config');

    // The skip says it too, or the two labels of one check disagree about the repo.
    const unresolvable = await run(scanOf('src/views/Home/index.vue'), {}, 'load', false);

    expect(unresolvable.label).toContain('could not resolve the generated config');
  });

  it('quotes a non-Error rejection too', async () => {
    // `error.message` on a thrown string is undefined, and "it would not resolve —
    // undefined —" is the same swallow with extra steps.
    const check = await wiringCheck({
      root: '/repo',
      blueprint,
      scanResult: scanOf('src/views/Home/index.vue'),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: async () => Promise.reject('EACCES on the eslint cache'),
    });

    expect(check.skipped).toContain('EACCES on the eslint cache');
  });

  it('synthesizes probes for empty layers — the empty repo is not exempt', async () => {
    // No source files at all (batch 7's greenfield): every layer probes via
    // a synthetic path, so a gutted config still turns red.
    const gutted = await run(scanOf('src/views/skip.gen.ts', 'src/views/a.test.ts'), {
      rules: {},
    });

    expect(gutted.ok).toBe(false);
    expect(gutted.detail).toContain('views:');
    expect(gutted.detail).toContain('services:');

    // And an intact merge verifies green — the union of every layer's needs.
    const layers = ['views', 'contexts', 'stores', 'services'];
    const expected = layers.map((layer) => expectedStructural(blueprint, layer));

    const survived = await run(scanOf(), {
      rules: {
        'blueprint/relative-escape': 'error',
        'no-restricted-imports': [2, {
          patterns: expected
            .flatMap((e) => [...e.groups])
            .map((group) => ({ group: JSON.parse(group) as string[] })),
        }],
        'no-restricted-syntax': [2, ...new Set(expected.flatMap((e) => [...e.selectors]))],
        'no-restricted-globals': [2, ...new Set(expected.flatMap((e) => [...e.globals]))],
      },
    });

    expect(survived.ok).toBe(true);
    expect(survived.label).not.toContain('skipped');
  });

  it('drops layers whose globs defeat synthesis or collide with exemptions', async () => {
    // `?` survives synthesis untransformed, so the candidate fails its own
    // glob — no probe, and with every layer in that shape, an honest skip.
    const odd: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, layerFiles: 'src/{layer}/?.js' },
    };

    const skipped = await wiringCheck({
      root: '/repo',
      blueprint: odd,
      scanResult: scanOf(),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader({}),
    });

    expect(skipped.ok).toBe(true);
    expect(skipped.label).toContain('no probe derivable');

    // A synthetic candidate shaped like a test file would lie (the emitted
    // entries exempt tests) — it is discarded instead.
    const testShaped: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, layerFiles: 'src/{layer}/**/*.test.js' },
    };

    const discarded = await wiringCheck({
      root: '/repo',
      blueprint: testShaped,
      scanResult: scanOf(),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader({}),
    });

    expect(discarded.label).toContain('no probe derivable');

    // An ignore pattern swallowing a layer removes only that layer's probe.
    const ignoreViews: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, layerFilesIgnore: 'src/views/**' },
    };

    const partial = await wiringCheck({
      root: '/repo',
      blueprint: ignoreViews,
      scanResult: scanOf(),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader({ rules: {} }),
    });

    expect(partial.ok).toBe(false);
    expect(partial.detail).not.toContain('views:');
    expect(partial.detail).toContain('services:');
  });
});

describe('expectedStructural', () => {
  it('mirrors emitLint tier handling for the fixtures ban', () => {
    const hasFixtures = (bp: Blueprint) =>
      [...expectedStructural(bp, 'views').groups].some((group) => group.includes('fixtures'));

    expect(hasFixtures({ ...blueprint, rules: { fixtureImports: { tier: 'warn' } } })).toBe(true);
    expect(hasFixtures({ ...blueprint, rules: { fixtureImports: { tier: 'off' } } })).toBe(false);
    expect(hasFixtures({ ...blueprint, rules: undefined })).toBe(false);
  });

  it('is version-stable: groups and selectors, no messages or severities', () => {
    const expected = expectedStructural(blueprint, 'views');

    // Same-layer ban across both aliases, redundant-segment ban, fixtures ban.
    expect([...expected.groups].some((g) => g.includes('~app/views/**'))).toBe(true);
    expect([...expected.groups].some((g) => g.includes('~root/fixtures'))).toBe(true);
    // stores is forbidden for views (allowedImporters: contexts only).
    expect([...expected.groups].some((g) => g.includes('~app/stores/**'))).toBe(true);
    expect([...expected.selectors].every((s) => s.includes('ExportNamedDeclaration'))).toBe(true);
    expect(expected.globals).toEqual(new Set(['fetch']));
  });
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

  it('goes red when the merge drops the stylistic argument', async () => {
    // Structural rules all intact — exactly the state that used to pass.
    const { '@stylistic/max-len': _len, '@stylistic/padding-line-between-statements': _pad, ...rest }
      = carried;

    const result = await check({ ...structural(), ...rest });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('rules.codeStyle is on but @stylistic/max-len resolved to nothing');
    expect(result.detail).toContain('`stylistic` argument is missing');
    expect(result.detail).toContain('rules.statementPadding is on');
  });

  it('goes red when the merge drops the imports argument', async () => {
    const { 'import-x/no-duplicates': _dup, ...rest } = carried;
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
    const { '@typescript-eslint/no-explicit-any': _any, ...rest } = carried;

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

describe('expectedStructural · deep-import targets', () => {
  // The deep-import ban's glob list — the folder-target list made visible.
  const deepImportGlobs = (bp: Blueprint, layer: string): string[] | undefined =>
    [...expectedStructural(bp, layer).groups]
      .map((group) => JSON.parse(group) as string[])
      .find((group) => group.some((glob) => glob.endsWith('/*/**')));

  it('names other folder-layout layers, and only those', () => {
    const mixed: Blueprint = {
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        layers: [
          { name: 'views', does: 'pages', layout: 'folder' },
          { name: 'utils', does: 'leaf helpers' },
          { name: 'services', does: 'io', layout: 'folder' },
        ],
      },
    };

    const globs = deepImportGlobs(mixed, 'views');

    // A flat layer has no module folders to reach inside of, so banning deep
    // imports into it would ban ordinary file imports. And the importing layer
    // is not a target of its own — reaching into a sibling module of the same
    // layer is what `blueprint/relative-escape` covers.
    expect(globs).toContain('~app/services/*/**');
    expect(globs?.some((glob) => glob.includes('utils'))).toBe(false);
    expect(globs?.some((glob) => glob.includes('views'))).toBe(false);
  });

  it('leaves out a layer that is already banned outright', () => {
    const globs = deepImportGlobs(blueprint, 'views');

    // `stores` is folder-layout, but views may not import it at all — a
    // deep-import ban there would be a second, weaker ban on the same edge,
    // and the weaker message is the one a reader would hit first.
    expect(globs).toContain('~app/services/*/**');
    expect(globs?.some((glob) => glob.includes('stores'))).toBe(false);
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
      (filePath: string) => (filePath.includes('views') ? survived([{ message: 'no group' }]) : survived([])),
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

describe('expectedStructural · the module the probe came from', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      // Targets the project root, so it reaches the modules through a `src`
      // prefix — the offset field issue #29 was about, one segment longer now.
      additionalAliases: { '~root': '.' },
      modules: [{ name: 'Fighter', does: 'the ship' }, { name: 'Combat', does: 'bullets' }],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
    rules: { fixtureImports: 'error' },
  };

  it('scopes every alias group to that module, on every alias', () => {
    // The module goes AFTER the alias's own offset, not before it: `~root`
    // reaches `src` first and the module sits under that.
    const groups = [...expectedStructural(modular, 'hooks', 'Fighter').groups].join(' ');

    expect(groups).toContain('~app/Fighter/hooks/**');
    expect(groups).toContain('~root/src/Fighter/hooks/**');
    expect(groups).not.toContain('"~app/hooks/**"');
  });

  it('leaves the fixture roots unscoped — they belong to no module', () => {
    // `~app/Fighter/fixtures` is a path no repo has. Scoping this group with
    // the rest would make doctor report a loss on every modular repo that
    // declares the gate, against a config emitLint wrote correctly.
    const groups = [...expectedStructural(modular, 'hooks', 'Fighter').groups].join(' ');

    expect(groups).toContain('~app/fixtures');
    expect(groups).not.toContain('~app/Fighter/fixtures');
  });

  it('asked without the module, expects what a flat project emits', () => {
    // The default arm is the flat project, not "any module" — a modular repo
    // reaching it would compare unscoped groups against scoped ones and report
    // the whole layer lost.
    const groups = [...expectedStructural(modular, 'hooks').groups].join(' ');

    expect(groups).toContain('~app/hooks/**');
    expect(groups).not.toContain('Fighter');
  });
});

describe('wiringCheck · a modular repo is probed inside a module', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [{ name: 'Fighter', does: 'the ship' }, { name: 'Combat', does: 'bullets' }],
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
    },
  };

  /**
   * Resolves the probe against the real emitted config, the way flat config
   * does: every entry whose `files` match, later rules replacing earlier ones.
   */
  const probeModular = async (scanResult: ScanResult) => {
    const probed: string[] = [];

    const check = await wiringCheck({
      root: '/repo',
      blueprint: modular,
      scanResult,
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader((filePath: string) => {
        const probe = filePath.split(path.sep).join('/');

        probed.push(probe);

        const rel = probe.replace('/repo/', '');

        return {
          rules: emitLint(modular)
            .filter((entry) => (entry.files ?? []).some((glob) => globToRegExp(glob).test(rel)))
            .reduce((merged, entry) => ({ ...merged, ...entry.rules }), {}),
        };
      }),
    });

    return { probed, check };
  };

  it('compares the probe against ITS module\'s entry, so an intact config is green', async () => {
    // The regression this guards: with the probe's module dropped, the
    // expectations carry no module segment, nothing matches, and doctor calls
    // every emitted pattern lost on a repo whose wiring is perfect.
    const { probed, check } = await probeModular(
      scanOf('src/Fighter/components/Hud/index.jsx'),
    );

    expect(probed).toEqual(['/repo/src/Fighter/components/Hud/index.jsx']);
    expect(check.ok).toBe(true);
    expect(check.detail).toBeUndefined();

    // `ok` alone cannot carry this: a loader that throws is caught and returned
    // as a SKIP riding on `ok: true`, so every assertion above passes while
    // nothing was compared. This test read green that way once already.
    expect(check.skipped).toBeUndefined();
  });

  it('turns red when the module\'s own entry is the one a merge replaced', async () => {
    // The other direction, because a check that cannot fail is not a check:
    // the same probe against a config that kept everything EXCEPT this
    // module's structural entry has to name the loss.
    const probed: string[] = [];

    const check = await wiringCheck({
      root: '/repo',
      blueprint: modular,
      scanResult: scanOf('src/Fighter/components/Hud/index.jsx'),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader((filePath: string) => {
        probed.push(filePath);

        const rel = filePath.split(path.sep).join('/').replace('/repo/', '');

        const merged = emitLint(modular)
          .filter((entry) => (entry.files ?? []).some((glob) => globToRegExp(glob).test(rel)))
          .reduce((rules, entry) => ({ ...rules, ...entry.rules }), {});

        // What a later flat-config entry scoped to this module does: flat
        // config never merges a rule two entries set, so the structural
        // patterns are gone and lint stays green about it.
        return { rules: { ...merged, 'no-restricted-imports': ['error', { patterns: [] }] } };
      }),
    });

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('components: no-restricted-imports lost');
  });

  it('falls back to a synthetic probe inside a declared module, never a bare layer', async () => {
    // `src/components/__blueprint_probe__…` matches no emitted entry on a
    // modular repo, so the synthetic path has to carry a module too or the
    // empty-layer arm resolves a config governing nothing.
    const { probed } = await probeModular(scanOf());

    expect(probed).toEqual(['/repo/src/Fighter/components/__blueprint_probe__.js']);
  });
});

describe('wiringCheck · the module-root ban is verified, not assumed', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [{ name: 'Fighter', does: 'the ship' }, { name: 'Combat', does: 'bullets' }],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  };

  const probe = async (over?: (rules: Record<string, unknown>) => Record<string, unknown>) => {
    const check = await wiringCheck({
      root: '/repo',
      blueprint: modular,
      scanResult: scanOf('src/Fighter/hooks/useRun/index.jsx'),
      wired: true,
      merged: true,
      hasTypescript: true,
      load: loader((filePath: string) => {
        const rel = filePath.split(path.sep).join('/').replace('/repo/', '');

        const merged = emitLint(modular)
          .filter((entry) => (entry.files ?? []).some((glob) => globToRegExp(glob).test(rel)))
          .reduce<Record<string, unknown>>(
            (rules, entry) => ({ ...rules, ...entry.rules }),
            {},
          );

        return { rules: over ? over(merged) : merged };
      }),
    });

    return check;
  };

  it('expects it, and an intact config carries it', () => {
    // `expectedStructural` gaining a key means doctor started comparing
    // something new — the tripwire above is what makes that deliberate.
    expect([...expectedStructural(modular, 'hooks', 'Fighter').paths])
      .toEqual(['~app/Fighter', '~app/Fighter/index']);
  });

  it('goes green when the paths survive the merge', async () => {
    const check = await probe();

    expect(check.ok).toBe(true);
    expect(check.skipped).toBeUndefined();
  });

  it('names the loss when a merge drops the paths but keeps the patterns', async () => {
    // The precise shape of a hand-fold that rebuilt the groups and forgot the
    // exact-path half — green everywhere else, and the upward edge back to
    // being lint-legal.
    const check = await probe((rules) => {
      const setting = rules['no-restricted-imports'] as [unknown, Record<string, unknown>];

      return {
        ...rules,
        'no-restricted-imports': ['error', { ...setting[1], paths: [] }],
      };
    });

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('no-restricted-imports lost the module-root ban');
    expect(check.detail).toContain('~app/Fighter');
  });

  it('does not read a package-ownership path as the module-root ban', async () => {
    // Containment, and nothing here expects a package path — so `packages is
    // not compared` stays true rather than quietly widening what a red means.
    const owning: Blueprint = {
      ...modular,
      architecture: {
        ...modular.architecture,
        layers: [{ name: 'hooks', does: 'state', layout: 'folder', owns: ['axios'] }],
      },
    };

    expect([...expectedStructural(owning, 'hooks', 'Fighter').paths])
      .toEqual(['~app/Fighter', '~app/Fighter/index']);
  });
});

describe('wiringCheck · the shapes a surviving module-root ban comes back as', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [{ name: 'Fighter', does: 'the ship' }],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  };

  const withPaths = async (paths: unknown[]) => wiringCheck({
    root: '/repo',
    blueprint: modular,
    scanResult: scanOf('src/Fighter/hooks/useRun/index.jsx'),
    wired: true,
    merged: true,
    hasTypescript: true,
    load: loader({
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [...expectedStructural(modular, 'hooks', 'Fighter').groups]
            .map((group) => ({ group: JSON.parse(group) as string[] })),
          paths,
        }],
        'blueprint/relative-escape': ['error', {}],
      },
    }),
  });

  it('reads the bare-string form eslint also accepts', async () => {
    const check = await withPaths(['~app/Fighter', '~app/Fighter/index']);

    expect(check.ok).toBe(true);
  });

  it('ignores an entry with no name instead of choking on it', async () => {
    // A hand-folded list can carry one. Containment means a garbage entry is
    // the user's business — it must neither crash the read nor poison the set
    // that decides whether the real ban survived.
    const check = await withPaths([
      { message: 'a fold that lost its name' },
      '~app/Fighter',
      { name: '~app/Fighter/index' },
    ]);

    expect(check.ok).toBe(true);
  });
});
