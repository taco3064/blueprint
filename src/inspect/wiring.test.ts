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
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: [] },
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

const run = (scanResult: ScanResult, resolved: unknown, throwOn?: 'load' | 'calculate') =>
  wiringCheck({
    root: '/repo',
    blueprint,
    scanResult,
    wired: true,
    load: loader(resolved, throwOn),
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

    expect(check).toEqual({ label: 'emitted rules survive the merged eslint config', ok: true });
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
