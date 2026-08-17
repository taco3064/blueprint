import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { ScanResult } from './types';
import { expectedStructural, wiringCheck } from './wiring';

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    additionalAliases: { '~root': 'src' },
    layers: [
      { name: 'views', does: 'pages' },
      {
        name: 'contexts',
        does: 'shared state',
        allowedImporters: [{ layer: 'views', selfOnly: true }],
      },
      { name: 'stores', does: 'state', allowedImporters: ['contexts'] },
      { name: 'services', does: 'io', owns: [{ global: 'fetch' }] },
    ],
    folder: { layout: 'folder', entry: 'index', private: [] },
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
    if (throwOn === 'load') {
      throw new Error('unresolvable');
    }

    return {
      ESLint: class {
        async calculateConfigForFile(filePath: string): Promise<unknown> {
          if (throwOn === 'calculate') {
            throw new Error('broken config');
          }

          return typeof resolved === 'function' ? resolved(filePath) : resolved;
        }
      },
    };
  };
}

const run = (
  scanResult: ScanResult,
  resolved: unknown,
  projectEslint: { throwOn?: 'load' | 'calculate'; merged?: boolean } = {},
) =>
  wiringCheck({
    root: '/repo',
    blueprint,
    scanResult,
    wired: true,
    merged: projectEslint.merged ?? true,
    hasTypescript: true,
    load: loader(resolved, projectEslint.throwOn),
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
      .toEqual(['groups', 'selectors', 'globals']);
  });
});

describe('wiringCheck · a merge that kept every artifact', () => {
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
});

describe('wiringCheck · the losses it names', () => {
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
});

describe('wiringCheck · what it skips rather than reds on', () => {
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

    const unloadable = await run(scanOf('src/views/Home/index.vue'), {}, { throwOn: 'load' });

    expect(unloadable.ok).toBe(true);
    expect(unloadable.label).toContain('could not resolve the merged config');

    const broken = await run(scanOf('src/views/Home/index.vue'), {}, { throwOn: 'calculate' });

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
    const generated = await run(scanOf('src/views/Home/index.vue'), {}, { merged: false });

    expect(generated.label).toContain('emitted rules survive the generated eslint config');
    expect(generated.label).not.toContain('merged eslint config');

    // The skip says it too, or the two labels of one check disagree about the repo.
    const unresolvable = await run(
      scanOf('src/views/Home/index.vue'),
      {},
      { throwOn: 'load', merged: false },
    );

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
});

describe('wiringCheck · layers with no file to probe', () => {
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
          { name: 'views', does: 'pages' },
          { name: 'utils', does: 'leaf helpers', folder: { layout: 'flat' } },
          { name: 'services', does: 'io' },
        ],
      },
    };

    const globs = deepImportGlobs(mixed, 'views');

    // A flat layer has no feature folders to reach inside of, so banning deep
    // imports into it would ban ordinary file imports. And the importing layer
    // is not a target of its own — reaching into a sibling folder of the same
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
