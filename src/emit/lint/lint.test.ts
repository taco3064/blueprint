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
    flow: 'one-way',
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
const SERVICE = 'src/services/api/api.ts';

describe('emitLint · dependency flow', () => {
  it('allows importing a downstream module through its entry', () => {
    expect(restricted('import { useX } from "~app/hooks/useX";', COMPONENT)).toEqual([]);
  });

  it('bans importing an upstream layer', () => {
    expect(restricted('import { Button } from "~app/components/Button";', SERVICE)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans importing the same layer via the alias', () => {
    expect(restricted('import { Card } from "~app/components/Card";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans an upper-level relative import', () => {
    expect(restricted('import { useX } from "../hooks/useX";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });
});

describe('emitLint · module boundaries', () => {
  it('bans reaching inside another module (deep import)', () => {
    expect(restricted('import x from "~app/hooks/useX/impl";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('does not catch undeclared folders in lint — deferred to inspect (S6)', () => {
    // ESLint group negation cannot express closed-world; inspect handles it.
    expect(restricted('import x from "~app/utils/helper";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · package ownership', () => {
  it('bans a package in a layer that does not own it', () => {
    expect(restricted('import axios from "axios";', COMPONENT)).toContain('no-restricted-imports');
  });

  it('allows a package in its owning layer', () => {
    expect(restricted('import axios from "axios";', SERVICE)).toEqual([]);
  });

  it('bans only the named import that another layer owns', () => {
    expect(restricted('import { useContext } from "react";', COMPONENT)).toContain(
      'no-restricted-imports',
    );

    expect(restricted('import { useState } from "react";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · global ownership', () => {
  it('bans a global in a layer that does not own it', () => {
    expect(restricted('const r = fetch("/x");', COMPONENT)).toContain('no-restricted-globals');
  });

  it('allows a global in its owning layer', () => {
    expect(restricted('const r = fetch("/x");', SERVICE)).toEqual([]);
  });
});

describe('emitLint · selfOnly re-export', () => {
  it('bans re-exporting from a selfOnly target', () => {
    expect(restricted('export { api } from "~app/services/api";', COMPONENT)).toContain(
      'no-restricted-syntax',
    );
  });

  it('still allows importing (not re-exporting) the selfOnly target', () => {
    expect(restricted('import { api } from "~app/services/api";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · shape', () => {
  it('emits one config entry per layer with a files glob', () => {
    const emitted = emitLint(blueprint);

    expect(emitted).toHaveLength(3);
    expect(emitted.every((entry) => Array.isArray(entry.files))).toBe(true);
  });

  it('honors emit.lint.severity', () => {
    const warned = emitLint({ ...blueprint, emit: { lint: { severity: 'warn' } } });
    const rule = warned[0].rules?.['no-restricted-imports'] as [string];

    expect(rule[0]).toBe('warn');
  });

  it('emits no gate entries when the blueprint has no rules record', () => {
    expect(emitLint(blueprint).some((entry) => entry.rules?.['max-lines'])).toBe(false);
  });

  it('emits a leading ignore entry and splits a layer on exempt files', () => {
    const bp = defineBlueprint({
      framework: 'auto',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: '' },
          { name: 'services', does: '', owns: [{ package: 'axios', exempt: ['**/*.gen.ts'] }] },
        ],
        flow: 'one-way',
        layerFilesIgnore: ['**/*.d.ts'],
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    const emitted = emitLint(bp);

    expect(emitted[0]).toEqual({ ignores: ['**/*.d.ts'] });

    const componentEntries = emitted.filter((entry) =>
      entry.files?.some((file) => file.includes('components')),
    );

    expect(componentEntries).toHaveLength(2);
    expect(componentEntries.some((entry) => entry.ignores?.includes('**/*.gen.ts'))).toBe(true);
  });
});

describe('emitLint · rules gates', () => {
  const gated = defineBlueprint({
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

  const emitted = emitLint(gated);
  const gates = emitted.find((entry) => entry.rules?.['max-lines']);

  it('maps maxLines to the built-in max-lines across every layer glob', () => {
    expect(gates?.rules?.['max-lines']).toEqual([
      'warn',
      { max: 50, skipBlankLines: true, skipComments: true },
    ]);

    expect(gates?.files).toEqual([
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

  it('ships the embedded plugin alongside blueprint/* rules', () => {
    expect(gates?.rules?.['blueprint/no-deep-watch']).toBe('error');
    expect(gates?.plugins?.blueprint).toBeDefined();
  });

  it('attaches use-prefix to the hooks layer only, with the default prefix', () => {
    const entry = emitted.find((item) => item.rules?.['blueprint/use-prefix']);

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

    expect(off).toHaveLength(3); // layer entries only — no gate entries.
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

  it('exempts test files from layer rules and gates, with overridable globs', () => {
    // Default: same-layer alias import passes in a test file.
    expect(
      restricted('import { Card } from "~app/components/Card";', 'src/components/Button/Button.test.ts'),
    ).toEqual([]);

    expect(emitted[0].ignores).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}',
      '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);

    const custom = defineBlueprint({
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: '**/*.mytest.js' },
    });

    expect(emitLint(custom)[0].ignores).toEqual(['**/*.mytest.js']);
  });

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
  });

  it('enforces the gates through a real Linter run', () => {
    const config = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitted,
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
