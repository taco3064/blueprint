import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

const blueprint = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }] },
      {
        name: 'services',
        does: 'net',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: [{ layer: 'components', selfOnly: true }, 'hooks'],
      },
    ],
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});

const config = [
  { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
  ...emitLint(blueprint),
];

const linter = new Linter({ configType: 'flat' });

/** Restricted-rule ids reported for `code` when linted as `filename`. */
function restricted(code: string, filename: string): string[] {
  return linter
    .verify(code, config, { filename })
    .map((message) => message.ruleId)
    .filter((id): id is string => id != null && id.startsWith('no-restricted-'));
}

const COMPONENT = 'src/components/Button/Button.ts';

const gatedBlueprint = defineBlueprint({
  ...blueprint,
  framework: 'vue',
  rules: {
    maxLines: { tier: 'warn', value: 50 },
    deepWatch: 'error',
    usePrefix: 'error',
    cycles: 'error', // Verify-side (inspect) — must not surface in lint.
    customThing: 'error', // unknown id — docs-only.
  },
});

const emittedGates = emitLint(gatedBlueprint);
const gatesEntry = emittedGates.find((entry) => entry.rules?.['max-lines']);

describe('emitLint · rules gates', () => {
  it('maps maxLines to the built-in max-lines across every layer glob', () => {
    expect(gatesEntry?.rules?.['max-lines']).toEqual([
      'warn',
      { max: 50, skipBlankLines: true, skipComments: true },
    ]);

    expect(gatesEntry?.files).toEqual([
      'src/components/**/*.{js,ts,vue}',
      'src/hooks/**/*.{js,ts,vue}',
      'src/services/**/*.{js,ts,vue}',
    ]);
  });

  it('defaults maxLines to 400 when no value is given', () => {
    const bare = emitLint(defineBlueprint({ ...blueprint, rules: { maxLines: 'error' } }));
    const rule = bare.find((entry) => entry.rules?.['max-lines'])?.rules?.['max-lines'];

    expect(rule).toEqual(['error', { max: 400, skipBlankLines: true, skipComments: true }]);
  });

  it('attaches use-prefix to the hooks layer only, with the default prefix', () => {
    const entry = emittedGates.find((item) => item.rules?.['blueprint/use-prefix']);

    expect(entry?.files).toEqual(['src/hooks/**/*.{js,ts,vue}']);
    expect(entry?.rules?.['blueprint/use-prefix']).toEqual(['error', { prefix: 'use' }]);
    expect(entry?.plugins?.blueprint).toBeDefined();
  });

  it('honors a custom use-prefix layer and prefix', () => {
    const custom = emitLint(defineBlueprint({
      ...blueprint,
      rules: { usePrefix: { tier: 'warn', layer: 'services', prefix: 'with' } },
    }));

    const entry = custom.find((item) => item.rules?.['blueprint/use-prefix']);

    expect(entry?.files).toEqual(['src/services/**/*.{js,jsx,ts,tsx,vue}']);
    expect(entry?.rules?.['blueprint/use-prefix']).toEqual(['warn', { prefix: 'with' }]);
  });

  it('drops deep-watch for react and every gate set to off', () => {
    const react = emitLint(defineBlueprint({
      ...blueprint,
      framework: 'react',
      rules: { maxLines: 'error', deepWatch: 'error' },
    }));

    const entry = react.find((item) => item.rules?.['max-lines']);

    expect(entry?.rules?.['blueprint/no-deep-watch']).toBeUndefined();
    expect(entry?.plugins).toBeUndefined();

    const off = emitLint(defineBlueprint({
      ...blueprint,
      rules: { maxLines: 'off', deepWatch: { tier: 'off' }, usePrefix: 'off' },
    }));

    expect(off).toHaveLength(4); // layer + escape entries only — no gate entries.
  });

  it('maps the metric triage family and unusedVars to built-ins', () => {
    const metric = defineBlueprint({
      ...blueprint,
      rules: {
        maxParams: 'warn',
        maxStatements: { tier: 'warn', value: 20 },
        maxLinesPerFunction: 'warn',
        complexity: { tier: 'error', value: 8 },
        unusedVars: 'error',
      },
    });

    const entry = emitLint(metric).find((item) => item.rules?.['max-params']);

    expect(entry?.rules).toMatchObject({
      'max-params': ['warn', 3],
      'max-statements': ['warn', 20],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 8],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    });

    expect(entry?.linterOptions).toEqual({ reportUnusedDisableDirectives: 'error' });
  });
});

describe('emitLint · the embedded plugin rides the entries that carry its rules', () => {
  it('ships the embedded plugin alongside blueprint/* rules', () => {
    expect(gatesEntry?.rules?.['blueprint/no-deep-watch']).toBe('error');
    expect(gatesEntry?.plugins?.blueprint).toBeDefined();
  });

  it('wires the handbook custom rules: test files, use-reactivity, typedef-only', () => {
    const custom = defineBlueprint({
      ...blueprint,
      rules: { testFilename: 'error', usePrefixReactivity: 'warn', typedefOnlyFile: 'warn' },
    });

    const config = emitLint(custom);
    const testEntry = config.find((item) => item.rules?.['blueprint/test-filename-matches-source']);

    expect(testEntry?.files).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}',
      '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);

    expect(testEntry?.plugins?.blueprint).toBeDefined();

    const shared = config.find((item) => item.rules?.['blueprint/use-prefix-needs-reactivity']);

    expect(shared?.rules?.['blueprint/use-prefix-needs-reactivity']).toBe('warn');
    expect(shared?.plugins?.blueprint).toBeDefined();

    const typedef = config.find((item) => item.rules?.['blueprint/no-typedef-only-file']);

    expect(typedef?.files).toEqual(['src/**/*.js']);
    // Every entry carrying a `blueprint/*` rule has to ship the plugin with it —
    // the whole point of embedding it. Without the registration eslint fails to
    // resolve the rule and the run dies, rather than the rule going quiet.
    expect(typedef?.plugins?.blueprint).toBeDefined();
  });
});

describe('emitLint · the files a gate is scoped to', () => {
  it('exempts test files from layer rules and gates, with overridable globs', () => {
    // Default: same-layer alias import passes in a test file.
    expect(
      restricted(
        'import { Card } from "~app/components/Card";',
        'src/components/Button/Button.test.ts',
      ),
    ).toEqual([]);

    expect(emittedGates[0].ignores).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}',
      '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);

    const custom = defineBlueprint({
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: '**/*.mytest.js' },
    });

    expect(emitLint(custom)[0].ignores).toEqual(['**/*.mytest.js']);
  });

  it('emits no entry scoped to nothing when testFiles exempts nothing', () => {
    // `testFiles: []` is a repo saying "tests inherit their layer's rules" — legal,
    // validated, and it made the testFilename entry `files: []`, which ESLint refuses
    // outright: `Key "files": Expected value to be a non-empty array`. inspect ran
    // clean and `impact` died on the emitted output, so an adopter read
    // `dist/config/types.d.ts` and invented a never-matching sentinel glob to stand in
    // for the empty array (field run #150).
    const none = defineBlueprint({
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: [] },
      rules: { testFilename: 'error' },
    });

    const emitted = emitLint(none);

    expect(emitted.find((item) => item.rules?.['blueprint/test-filename-matches-source']))
      .toBeUndefined();

    // The class, not the instance: ESLint rejects an empty `files` on ANY entry, so no
    // emitted entry may carry one whatever the config says. Every other `files` here is
    // built from `layers`, which validation already refuses to leave empty.
    for (const entry of emitted) {
      if (entry.files !== undefined) {
        expect(entry.files.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('emitLint · the gates through a real Linter run', () => {
  it('bans fixture imports through each layer structural rule', () => {
    const fixture = defineBlueprint({ ...blueprint, rules: { fixtureImports: 'error' } });

    const cfg = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitLint(fixture),
    ];

    const ids = (code: string) =>
      linter.verify(code, cfg, { filename: COMPONENT }).map((message) => message.ruleId);

    expect(ids('import demo from "~app/fixtures/demo";')).toContain('no-restricted-imports');
    expect(ids('import demo from "~app/fixtures/deep/demo";')).toContain('no-restricted-imports');
    // The structural bans still ride the same rule (merged, not replaced).
    expect(ids('import { Card } from "~app/components/Card";')).toContain('no-restricted-imports');
    expect(ids('import { useX } from "~app/hooks/useX";')).toEqual([]);
  });

  it('enforces the gates through a real Linter run', () => {
    const config = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emittedGates,
    ];

    const ids = (code: string, filename: string) =>
      linter.verify(code, config, { filename }).map((message) => message.ruleId);

    expect(ids('watch(x, cb, { deep: true });', COMPONENT)).toContain('blueprint/no-deep-watch');

    expect(ids('export function getCart() {}', 'src/hooks/useCart/useCart.ts')).toContain(
      'blueprint/use-prefix',
    );

    expect(ids('export function useCart() {}', 'src/hooks/useCart/useCart.ts')).toEqual([]);
  });
});

describe('emitLint · TypeScript-aware unusedVars', () => {
  const gated = defineBlueprint({ ...blueprint, rules: { unusedVars: 'error' } });
  const tsPlugin = { rules: {} };

  it('swaps core no-unused-vars for the TS twin when the plugin is injected', () => {
    const entry = emitLint(gated, { typescript: tsPlugin }).find(
      (item) => item.rules?.['@typescript-eslint/no-unused-vars'],
    );

    expect(entry?.rules?.['no-unused-vars']).toBe('off');

    expect(entry?.rules?.['@typescript-eslint/no-unused-vars']).toEqual([
      'error',
      { argsIgnorePattern: '^_' },
    ]);

    expect(entry?.plugins?.['@typescript-eslint']).toBe(tsPlugin);
  });

  it('keeps the core rule without the option', () => {
    const entry = emitLint(gated).find((item) => item.rules?.['no-unused-vars']);

    expect(entry?.rules?.['no-unused-vars']).toEqual(['error', { argsIgnorePattern: '^_' }]);
    expect(entry?.rules?.['@typescript-eslint/no-unused-vars']).toBeUndefined();
    expect(entry?.plugins).toBeUndefined();
  });

  it('registers both plugins when a blueprint/* gate rides the same entry', () => {
    const both = defineBlueprint({
      ...blueprint,
      framework: 'vue',
      rules: { unusedVars: 'error', deepWatch: 'error' },
    });

    const entry = emitLint(both, { typescript: tsPlugin }).find(
      (item) => item.rules?.['blueprint/no-deep-watch'],
    );

    expect(entry?.plugins?.blueprint).toBeDefined();
    expect(entry?.plugins?.['@typescript-eslint']).toBe(tsPlugin);
  });
});
