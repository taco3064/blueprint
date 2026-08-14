import stylisticPlugin from '@stylistic/eslint-plugin';
import { Linter } from 'eslint';
import importsPlugin from 'eslint-plugin-import-x';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';
import type { LintConfigEntry } from './types';
import { STATEMENT_PADDING } from './patterns';

const blueprint = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }], layout: 'folder' },
      {
        name: 'services',
        does: 'net',
        owns: ['axios', { global: 'fetch' }],
        layout: 'folder',
        allowedImporters: [{ layer: 'components', selfOnly: true }, 'hooks'],
      },
    ],
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

  it('bans an upper-level relative import through the escape rule', () => {
    // Depth-aware: lives in blueprint/relative-escape, not a literal pattern.
    const ids = linter
      .verify('import { useX } from "../hooks/useX";', config, { filename: COMPONENT })
      .map((message) => message.ruleId);

    expect(ids).toContain('blueprint/relative-escape');
  });

  it('allows a relative import that stays inside the module', () => {
    const ids = linter
      .verify('import { helper } from "./helper";', config, { filename: COMPONENT })
      .map((message) => message.ruleId);

    expect(ids).not.toContain('blueprint/relative-escape');
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

describe('emitLint · additionalAliases with an offset target (field #29)', () => {
  // '~root': '.' — the field repo's shape: layers live under src/, the
  // alias points at the repo root. Patterns composed as `~root/<layer>`
  // banned paths no real import ever used, so the whole ~root leg was a
  // silent no-op while the playbook claimed it joined every ban.
  const rooted = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      additionalAliases: { '~root': '.', '~shared': './src/shared' },
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'services',
          does: 'net',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
    },
  });

  const rootedConfig = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(rooted),
  ];

  const hits = (code: string, filename: string) =>
    linter
      .verify(code, rootedConfig, { filename })
      .map((message) => message.ruleId)
      .filter((id): id is string => id != null && id.startsWith('no-restricted-'));

  it('bans the real ~root/src/… path — flow and selfOnly alike', () => {
    expect(hits('import { V } from "~root/src/views/V";', 'src/services/api.ts'))
      .toContain('no-restricted-imports');

    expect(hits('export { api } from "~root/src/services/api";', 'src/views/Home.ts'))
      .toContain('no-restricted-syntax');
  });

  it('a subfolder alias has no layer surface — no bans through it', () => {
    expect(hits('import { d } from "~shared/date";', 'src/views/Home.ts')).toEqual([]);
  });
});

describe('emitLint · shape', () => {
  it('emits one config entry per layer plus the escape entry, all with files globs', () => {
    const emitted = emitLint(blueprint);

    expect(emitted).toHaveLength(4); // 3 layers + blueprint/relative-escape
    expect(emitted.every((entry) => Array.isArray(entry.files))).toBe(true);

    const escape = emitted.find((entry) => entry.rules?.['blueprint/relative-escape']);

    expect(escape?.rules?.['blueprint/relative-escape']).toEqual([
      'error',
      {
        layouts: { components: 'folder', hooks: 'folder', services: 'folder' },
        entries: { components: 'index', hooks: 'index', services: 'index' },
        // Passed, never inferred by the rule: the plugin cannot see the config,
        // so a rule left to guess the depth reads a module name as a layer and
        // registers no visitors at all.
        depth: 0,
      },
    ]);

    expect(escape?.plugins?.blueprint).toBeDefined();
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
          { name: 'components', does: '', layout: 'folder' },
          { name: 'services', does: '', owns: [{ package: 'axios', exempt: ['**/*.gen.ts'] }], layout: 'folder' },
        ],
        layerFilesIgnore: ['**/*.d.ts'],
      },
    });

    const emitted = emitLint(bp);

    expect(emitted[0]).toEqual({ ignores: ['**/*.d.ts'] });

    const componentEntries = emitted.filter(
      (entry) =>
        entry.rules?.['no-restricted-imports']
        && entry.files?.some((file) => file.includes('components')),
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
      if (entry.files !== undefined) expect(entry.files.length).toBeGreaterThan(0);
    }
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
    // Every entry carrying a `blueprint/*` rule has to ship the plugin with it —
    // the whole point of embedding it. Without the registration eslint fails to
    // resolve the rule and the run dies, rather than the rule going quiet.
    expect(typedef?.plugins?.blueprint).toBeDefined();
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

describe('emitLint · injected-plugin gates', () => {
  const gated = defineBlueprint({
    ...blueprint,
    rules: { explicitAny: 'error', statementsPerLine: 'error', statementPadding: 'warn' },
  });

  const tsPlugin = { rules: {} };

  it('emits nothing for any gate whose carrier plugin is absent', () => {
    // An unresolvable rule id crashes the whole eslint run, so a gate whose
    // carrier is missing must vanish instead — silently, which is why the
    // gate catalog's note is where that fact has to be stated.
    expect(emitLint(gated)).toHaveLength(4); // layer entries + escape only
  });

  it('emits explicitAny only through the injected TS plugin, with no core twin', () => {
    const entry = emitLint(gated, { typescript: tsPlugin })
      .find((item) => item.rules?.['@typescript-eslint/no-explicit-any']);

    expect(entry?.rules?.['@typescript-eslint/no-explicit-any']).toBe('error');
    expect(entry?.plugins?.['@typescript-eslint']).toBe(tsPlugin);
    // Unlike unusedVars there is no core fallback to switch off.
    expect(entry?.rules?.['no-explicit-any']).toBeUndefined();
  });

  it('pins the line unit at one statement, hard-wired rather than configurable', () => {
    const entry = emitLint(gated, { stylistic: stylisticPlugin })
      .find((item) => item.rules?.['@stylistic/max-statements-per-line']);

    expect(entry?.rules?.['@stylistic/max-statements-per-line']).toEqual(['error', { max: 1 }]);

    // A declared `value` is ignored — max: 1 is the whole point of the gate.
    const valued = emitLint(
      defineBlueprint({ ...blueprint, rules: { statementsPerLine: { tier: 'error', value: 4 } } }),
      { stylistic: stylisticPlugin },
    ).find((item) => item.rules?.['@stylistic/max-statements-per-line']);

    expect(valued?.rules?.['@stylistic/max-statements-per-line']).toEqual(['error', { max: 1 }]);
  });

  it('carries the padding option list whole, at the declared tier', () => {
    const entry = emitLint(gated, { stylistic: stylisticPlugin })
      .find((item) => item.rules?.['@stylistic/padding-line-between-statements']);

    const rule = entry?.rules?.['@stylistic/padding-line-between-statements'] as unknown[];

    expect(rule[0]).toBe('warn');
    expect(rule).toHaveLength(STATEMENT_PADDING.length + 1);
    expect(rule[1]).toEqual({ blankLine: 'always', prev: 'block-like', next: '*' });
  });

  it('splits the shape family off the test-exempt entry, each with its plugins', () => {
    const emitted = emitLint(
      defineBlueprint({
        ...blueprint,
        framework: 'vue',
        rules: {
          explicitAny: 'error',
          deepWatch: 'error',
          statementPadding: 'error',
          importBlock: 'error',
        },
      }),
      { typescript: tsPlugin, stylistic: stylisticPlugin, imports: importsPlugin },
    );

    // Metrics and type hygiene stay exempt from tests…
    const shared = emitted.find((item) => item.rules?.['blueprint/no-deep-watch']);

    expect(shared?.ignores).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}',
      '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);

    expect(shared?.plugins?.blueprint).toBeDefined();
    expect(shared?.plugins?.['@typescript-eslint']).toBe(tsPlugin);

    // …while the shape family covers tests too: a duplicate import or a
    // collapsed line is no easier to read in a spec file.
    const shape = emitted.find((item) => item.rules?.['import-x/no-duplicates']);

    expect(shape?.ignores).toBeUndefined();
    expect(shape?.rules?.['@stylistic/padding-line-between-statements']).toBeDefined();
    expect(shape?.plugins?.['@stylistic']).toBe(stylisticPlugin);
    expect(shape?.plugins?.['import-x']).toBe(importsPlugin);
  });

  it('enforces both statement gates through a real Linter run', () => {
    const cfg = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitLint(gated, { stylistic: stylisticPlugin }),
    ];

    const ids = (code: string) =>
      linter.verify(code, cfg, { filename: COMPONENT }).map((message) => message.ruleId);

    // The evasion the gate exists for: a line budget met by collapsing.
    expect(ids('const a = 1; const b = 2;')).toContain('@stylistic/max-statements-per-line');
    expect(ids('const a = 1;\nconst b = 2;\n')).not.toContain('@stylistic/max-statements-per-line');

    expect(ids('function f() {\n  const a = 1;\n  return a;\n}\n'))
      .toContain('@stylistic/padding-line-between-statements');

    expect(ids('function f() {\n  const a = 1;\n\n  return a;\n}\n'))
      .not.toContain('@stylistic/padding-line-between-statements');
  });

  it('flags both import mistakes an incrementally-editing agent makes', () => {
    const cfg = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitLint(
        defineBlueprint({ ...blueprint, rules: { importBlock: 'error' } }),
        { imports: importsPlugin },
      ),
    ];

    const ids = (code: string) =>
      linter.verify(code, cfg, { filename: COMPONENT }).map((message) => message.ruleId);

    expect(ids('import { a } from "./m";\nimport { b } from "./m";\n'))
      .toContain('import-x/no-duplicates');

    expect(ids('export const x = 1;\nimport { a } from "./m";\n')).toContain('import-x/first');
    expect(ids('import { a, b } from "./m";\n\nexport const x = a + b;\n')).toEqual([]);
  });
});

describe('emitLint · codeStyle', () => {
  const styled = (over: Record<string, unknown> = {}) =>
    emitLint(
      defineBlueprint({ ...blueprint, rules: { codeStyle: { tier: 'error', ...over } } }),
      { stylistic: stylisticPlugin },
    ).find((entry) => entry.rules?.['@stylistic/indent']);

  it('carries the house values for the knobs it deliberately does not expose', () => {
    // arrowParens and blockSpacing are not configurable — a repo that wants
    // other braces turns the gate off and declares its own set. Unasserted,
    // they can only ever change by accident, and every adopting repo inherits
    // that change on the next version bump.
    const rules = styled()?.rules ?? {};

    expect(rules['@stylistic/arrow-parens']).toMatchObject({ 0: 'error', 1: 'always' });
    expect(rules['@stylistic/block-spacing']).toMatchObject({ 0: 'error', 1: 'always' });
  });

  it('emits the stylistic bundle plus the three rules it leaves out', () => {
    const rules = styled()?.rules ?? {};

    // The bundle itself — read from customize(), not hand-listed.
    expect(rules['@stylistic/quotes']).toEqual([
      'error', 'single', { allowTemplateLiterals: 'always', avoidEscape: false },
    ]);

    expect(rules['@stylistic/semi']).toEqual(['error', 'always']);
    expect(rules['@stylistic/indent']).toMatchObject({ 0: 'error', 1: 2 });

    // The three customize() omits. max-len must not exempt plain strings —
    // otherwise a long line escapes the cap by containing one.
    expect(rules['@stylistic/max-len']).toEqual(['error', {
      code: 90,
      ignoreUrls: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      ignoreStrings: false,
    }]);

    expect(rules['@stylistic/linebreak-style']).toEqual(['error', 'unix']);
    // curly is core — without it `if (x) return;` is ONE statement and slips
    // past max-statements-per-line.
    expect(rules.curly).toEqual(['error', 'all']);
  });

  it('honors the four declared knobs and nothing else', () => {
    const rules = styled({ indent: 4, quotes: 'double', semi: false, maxLen: 120 })?.rules ?? {};

    expect(rules['@stylistic/indent']).toMatchObject({ 0: 'error', 1: 4 });

    expect(rules['@stylistic/quotes']).toEqual([
      'error', 'double', { allowTemplateLiterals: 'always', avoidEscape: false },
    ]);

    expect(rules['@stylistic/semi']).toEqual(['error', 'never']);
    expect((rules['@stylistic/max-len'] as [string, { code: number }])[1].code).toBe(120);
    // Not a knob — the house value stands.
    expect(rules['@stylistic/brace-style']).toEqual(['error', '1tbs', { allowSingleLine: true }]);
  });

  it('lets an explicit statementsPerLine win over the bundle, off included', () => {
    // customize() already carries max-statements-per-line, so a gate set to
    // `off` must emit an explicit off — otherwise the bundle silently
    // switches it back on and the user cannot turn it off at all.
    const off = emitLint(
      defineBlueprint({ ...blueprint, rules: { codeStyle: 'error', statementsPerLine: 'off' } }),
      { stylistic: stylisticPlugin },
    ).find((entry) => entry.rules?.['@stylistic/indent']);

    expect(off?.rules?.['@stylistic/max-statements-per-line']).toBe('off');

    const warned = emitLint(
      defineBlueprint({
        ...blueprint,
        rules: { codeStyle: 'error', statementsPerLine: 'warn' },
      }),
      { stylistic: stylisticPlugin },
    ).find((entry) => entry.rules?.['@stylistic/indent']);

    expect(warned?.rules?.['@stylistic/max-statements-per-line']).toEqual(['warn', { max: 1 }]);

    // Without the bundle there is nothing to override, so `off` emits no line
    // at all rather than an inert one on an otherwise empty entry.
    const alone = emitLint(
      defineBlueprint({ ...blueprint, rules: { statementsPerLine: 'off' } }),
      { stylistic: stylisticPlugin },
    );

    expect(alone).toHaveLength(4); // layer entries + escape only
  });

  it('throws rather than governing nothing when the plugin has no customize()', () => {
    // Emitting an empty bundle would be the exact silent-vacuum failure this
    // whole gate family exists to prevent.
    expect(() => emitLint(
      defineBlueprint({ ...blueprint, rules: { codeStyle: 'error' } }),
      { stylistic: { rules: {} } },
    )).toThrow('configs.customize()');
  });

  it('closes every collapse route through a real Linter run', () => {
    const cfg = [
      { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
      ...emitLint(
        defineBlueprint({
          ...blueprint,
          rules: { codeStyle: 'error', statementsPerLine: 'error' },
        }),
        { stylistic: stylisticPlugin },
      ),
    ];

    const ids = (code: string) =>
      linter.verify(code, cfg, { filename: COMPONENT }).map((message) => message.ruleId);

    const long = 'const total = collection.filter(item => item.enabled).map(item => item.amount)'
      + '.reduce((acc, value) => acc + value, 0).toFixed(2);';

    expect(ids('const a = 1; const b = 2;')).toContain('@stylistic/max-statements-per-line');
    expect(ids('function f(x) {\n  if (x) return 1;\n\n  return 2;\n}\n')).toContain('curly');
    expect(ids(`${long}\n`)).toContain('@stylistic/max-len');
    expect(ids('function f() {\nconst a = 1;\n\nreturn a;\n}\n')).toContain('@stylistic/indent');
    expect(ids('const a = "x"\n')).toContain('@stylistic/quotes');
    expect(ids('const a = 1;\r\n')).toContain('@stylistic/linebreak-style');

    // A 101-char line does not escape the cap by containing a string —
    // `ignoreStrings` would have exempted this whole line.
    const withString = 'const k = buildCacheKey(alpha, bravo, charlie, delta, echo, foxtrot, '
      + '\'-\').toLowerCase().slice(0, 64);';

    expect(ids(`${withString}\n`)).toContain('@stylistic/max-len');
  });
});

describe('emitLint · per-layer module layout', () => {
  const mixed = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: 'routes' },
        { name: 'resources', does: 'features', layout: 'folder' },
        { name: 'services', does: 'net' },
      ],
    },
  });

  const cfg = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(mixed),
  ];

  const ids = (code: string, filename: string) =>
    linter.verify(code, cfg, { filename }).map((message) => message.ruleId);

  it('bans deep imports into the folder-layout layer, entry imports stay legal', () => {
    expect(ids('import x from "~app/resources/matches/impl";', 'src/pages/Home.ts'))
      .toContain('no-restricted-imports');

    expect(ids('import x from "~app/resources/matches";', 'src/pages/Home.ts'))
      .not.toContain('no-restricted-imports');
  });

  it('does not ban deep paths into flat-layout layers', () => {
    expect(ids('import x from "~app/services/api/client";', 'src/pages/Home.ts'))
      .not.toContain('no-restricted-imports');
  });

  it('mirrors inspect: intra-module relatives pass, cross-module relatives fail', () => {
    // Inside a folder module, `../` stays within the module.
    expect(ids('import x from "../MatchesList";', 'src/resources/matches/components/Row.ts'))
      .not.toContain('blueprint/relative-escape');

    // Crossing into a sibling module leaves it.
    expect(ids('import x from "../../markets/Board";', 'src/resources/matches/components/Row.ts'))
      .toContain('blueprint/relative-escape');

    // In the flat layer, relatives are free within the layer…
    expect(ids('import x from "./Nav";', 'src/pages/Home.ts'))
      .not.toContain('blueprint/relative-escape');

    // …but crossing layers relatively must use the alias.
    expect(ids('import x from "../services/api";', 'src/pages/Home.ts'))
      .toContain('blueprint/relative-escape');
  });
});

describe('emitLint · what an exempted package splits into', () => {
  const mixed = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: '', layout: 'folder' },
        {
          name: 'services',
          does: '',
          layout: 'folder',
          // One owned package excuses some files, the other excuses none — the
          // pair is what makes the split observable at all.
          owns: [{ package: 'axios', exempt: ['**/*.gen.ts', ''] }, { package: 'lodash' }],
        },
      ],
    },
  });

  const banned = (entry: LintConfigEntry) =>
    ((entry.rules?.['no-restricted-imports'] as [unknown, { paths?: { name: string }[] }])[1]
      .paths ?? []).map((path) => path.name);

  it('bans only the unexcused packages on the entry that covers every file', () => {
    const entries = emitLint(mixed).filter(
      (entry) =>
        entry.rules?.['no-restricted-imports'] && entry.files?.some((f) => f.includes('components')),
    );

    expect(entries).toHaveLength(2);

    const wide = entries.find((entry) => !entry.ignores?.includes('**/*.gen.ts'));
    const narrow = entries.find((entry) => entry.ignores?.includes('**/*.gen.ts'));

    // The wide entry reaches the exempted files too, so it may only carry the
    // bans that hold everywhere. Carrying `axios` there bans it in the very
    // files the author excused; carrying only `axios` inverts the split and
    // leaves `lodash` unbanned in every file.
    expect(banned(wide as LintConfigEntry)).toEqual(['lodash']);
    expect(banned(narrow as LintConfigEntry)).toEqual(['axios', 'lodash']);
  });

  it('drops an empty exempt glob instead of handing it to ignores', () => {
    const narrow = emitLint(mixed).find((entry) => entry.ignores?.includes('**/*.gen.ts'));

    // `ignores: ['']` is not a glob eslint can use, and it rides in the same
    // list as the test exemptions this entry depends on.
    expect(narrow?.ignores).not.toContain('');
  });
});

describe('emitLint · which layers become deep-import targets', () => {
  it('names the other folder layers, never the layer itself', () => {
    const entry = emitLint(blueprint).find(
      (item) =>
        item.rules?.['no-restricted-imports'] && item.files?.some((f) => f.includes('components')),
    );

    const groups = (
      entry?.rules?.['no-restricted-imports'] as [unknown, { patterns: { group: string[] }[] }]
    )[1].patterns.flatMap((pattern) => pattern.group);

    expect(groups).toContain('~app/hooks/*/**');
    expect(groups).toContain('~app/services/*/**');

    // The layer's own modules are already banned wholesale by the same-layer
    // group, and no-restricted-imports reports once per matched group — so
    // naming itself here double-reports every same-layer deep import.
    expect(groups).not.toContain('~app/components/*/**');
  });

  it('adds no fixture group unless fixtureImports is declared', () => {
    const patterns = (
      emitLint(blueprint).find(
        (item) =>
          item.rules?.['no-restricted-imports']
          && item.files?.some((f) => f.includes('components')),
      )?.rules?.['no-restricted-imports'] as [unknown, { patterns: { message?: string }[] }]
    )[1].patterns;

    // The fixture ban rides the structural rule, so an unasked-for one is a
    // production ban on a folder the repo may legitimately import from.
    expect(patterns.some((pattern) => pattern.message?.includes('must not import fixtures')))
      .toBe(false);
  });
});

describe('emitLint · registering only the plugins an entry needs', () => {
  it('keeps the stylistic and import-x registrations apart', () => {
    const options = { stylistic: stylisticPlugin, imports: importsPlugin };

    const importOnly = emitLint(
      defineBlueprint({ ...blueprint, rules: { importBlock: 'error' } }),
      options,
    ).find((entry) => entry.rules?.['import-x/no-duplicates']);

    // A plugin registered but unused is not harmless: two entries registering
    // the same key with different objects is a flat-config error, and the
    // adopting repo's own registration is exactly what would collide.
    expect(importOnly?.plugins?.['import-x']).toBe(importsPlugin);
    expect(importOnly?.plugins).not.toHaveProperty('@stylistic');

    const styleOnly = emitLint(
      defineBlueprint({ ...blueprint, rules: { statementPadding: 'error' } }),
      options,
    ).find((entry) => entry.rules?.['@stylistic/padding-line-between-statements']);

    expect(styleOnly?.plugins?.['@stylistic']).toBe(stylisticPlugin);
    expect(styleOnly?.plugins).not.toHaveProperty('import-x');
  });

  it('registers the TypeScript plugin only for a rule that comes from it', () => {
    const emitted = emitLint(
      defineBlueprint({ ...blueprint, framework: 'vue', rules: { deepWatch: 'error' } }),
      { typescript: { rules: {} } },
    );

    const shared = emitted.find((entry) => entry.rules?.['blueprint/no-deep-watch']);

    expect(shared?.plugins?.blueprint).toBeDefined();
    expect(shared?.plugins).not.toHaveProperty('@typescript-eslint');
  });
});

describe('emitLint · the line unit when nothing overrides it', () => {
  it('leaves the codeStyle bundle to carry it', () => {
    // `statementsPerLine` written as `off` turns the bundle's copy off too —
    // that is the documented override. NOT writing it must leave the bundle's
    // own setting alone; switching it off unasked removes a gate the author
    // never touched, and the catalog still reports codeStyle as on.
    const shape = emitLint(
      defineBlueprint({ ...blueprint, rules: { codeStyle: 'error' } }),
      { stylistic: stylisticPlugin },
    ).find((entry) => entry.rules?.['@stylistic/indent']);

    expect(shape?.rules?.['@stylistic/max-statements-per-line']).not.toBe('off');
  });
});

describe('emitLint · a config that declares emit without a lint block', () => {
  it('falls back to error rather than reaching through the missing block', () => {
    // `emit: { agents: [...] }` is what `init --agent claude` writes. Reaching
    // for `lint.severity` through it unguarded throws, and emitLint is called
    // from the generated eslint config — so every lint run in the repo dies.
    const agentsOnly = defineBlueprint({ ...blueprint, emit: { agents: ['claude'] } });

    const entry = emitLint(agentsOnly).find((item) => item.rules?.['no-restricted-imports']);

    expect((entry?.rules?.['no-restricted-imports'] as [string])[0]).toBe('error');
  });
});

describe('emitLint · the inner layer flow reaches inside a module', () => {
  // #185 gave `files:` the module dimension and the alias patterns inside those
  // entries did not follow, so `~app/hooks/**` was emitted against a tree whose
  // only real spelling is `~app/GameStage/hooks/X` — three bans that matched
  // nothing while `analyze` reported the same imports. Every case below is red
  // through the real linter, not an assertion about the emitted text.
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'routing', layers: false, imports: ['GameStage'] },
        { name: 'GameStage', does: 'the run', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  });

  const modularConfig = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(modular),
  ];

  /** Restricted-rule ids reported for `code` when linted as `filename`. */
  const banned = (code: string, filename: string): string[] =>
    linter
      .verify(code, modularConfig, { filename })
      .map((message) => message.ruleId)
      .filter((id): id is string => id != null && id.startsWith('no-restricted-'));

  // A folder-layout unit, so `../useTick` addresses a sibling rather than the
  // module root — at `hooks/useRun.ts` the same specifier is the upward edge.
  const HOOK = 'src/GameStage/hooks/useRun/useRun.ts';
  const COMPONENT = 'src/GameStage/components/Hud/Hud.tsx';

  it('bans a same-layer import through the module-scoped alias', () => {
    expect(banned('import { t } from "~app/GameStage/hooks/useTick";', HOOK))
      .toContain('no-restricted-imports');
  });

  it('bans an upward-flow import through the module-scoped alias', () => {
    expect(banned('import { Hud } from "~app/GameStage/components/Hud";', HOOK))
      .toContain('no-restricted-imports');
  });

  it('bans a reach past a sibling unit\'s entry inside the module', () => {
    expect(banned('import { x } from "~app/GameStage/hooks/useRun/impl";', COMPONENT))
      .toContain('no-restricted-imports');
  });

  it('leaves the legal edges alone — the unit\'s entry, and a relative sibling', () => {
    expect(banned('import { useRun } from "~app/GameStage/hooks/useRun";', COMPONENT)).toEqual([]);
    expect(banned('import { t } from "../useTick";', HOOK)).toEqual([]);
  });

  it('bans a cross-module reach past a declared dependency\'s entry', () => {
    // GameStage declares Combat, so `~app/Combat` resolves — and nothing
    // deeper. This case was silent until #182 and is the boundary between the
    // two depths: the entry above governs the flow INSIDE GameStage, and this
    // group governs what GameStage may address outside itself.
    expect(banned('import { d } from "~app/Combat/hooks/useDamage";', HOOK))
      .toContain('no-restricted-imports');

    expect(banned('import { d } from "~app/Combat";', HOOK)).toEqual([]);
  });

  it('bans a module this one never named, at its entry and inside it', () => {
    // Isolation by default: GameStage names Combat and nothing else, so the
    // third module is unreachable however it is addressed.
    expect(banned('import { x } from "~app/app";', HOOK)).toContain('no-restricted-imports');

    expect(banned('import { x } from "~app/app/routes/Game";', HOOK))
      .toContain('no-restricted-imports');
  });

  it('emits one entry per (module, layer), each scoped to its own module', () => {
    // The dimension cannot live on a shared entry: the ban names the importing
    // module's own segment, so one entry across three modules would ban two of
    // them from a path only the third can spell.
    const entries = emitLint(modular).filter(
      (entry) => entry.rules?.['no-restricted-imports'] && entry.files?.[0].includes('/hooks/'),
    );

    expect(entries).toHaveLength(2); // {GameStage, Combat} × {hooks}

    for (const entry of entries) {
      const module = entry.files?.[0].split('/')[1];
      const declared = modular.architecture.modules?.map((entry_) => entry_.name) ?? [];

      const groups = (
        entry.rules?.['no-restricted-imports'] as [unknown, { patterns: { group: string[] }[] }]
      )[1].patterns.flatMap((pattern) => pattern.group);

      expect(entry.files).toHaveLength(1);

      // Every group addressing a LAYER carries this module's segment. The
      // cross-module groups address a module and are excluded by name rather
      // than by shape, so a layer group losing its segment cannot hide here.
      const inner = groups
        .filter((glob) => glob.startsWith('~app'))
        .filter((glob) => !declared.some((name) => glob.startsWith(`~app/${name}`) && name !== module));

      expect(inner.length).toBeGreaterThan(0);

      for (const group of inner) expect(group.startsWith(`~app/${module}/`)).toBe(true);
    }
  });

  it('emits no layer entry for a layers:false module', () => {
    // It has no layer flow to govern. Its files still carry the relative-escape
    // entry, and #182 is what gives them their module-level bans.
    const globs = emitLint(modular).flatMap((entry) => entry.files ?? []);

    // No `src/app/<layer>/…` glob exists at all — `app` opted out of the layer
    // vocabulary, so there is no (app, layer) pair for an entry to govern.
    const layerNames = modular.architecture.layers.map((layer) => layer.name);

    expect(globs.filter((glob) => layerNames.some((l) => glob.startsWith(`src/app/${l}/`))))
      .toEqual([]);

    // It does get the module-level entry #182 adds — governance without the
    // layer vocabulary is the whole point of `layers: false`.
    const moduleEntry = emitLint(modular).find((entry) =>
      entry.files?.[0] === 'src/app/**/*.{js,jsx,ts,tsx}' && entry.rules?.['no-restricted-imports']);

    expect(moduleEntry).toBeDefined();
  });
});

describe('emitLint · the selfOnly selector reaches inside a module too', () => {
  it('scopes the re-export ban to the importing module', () => {
    // Same defect as the pattern groups, one rule over: a selector anchored at
    // `^~app/contexts/` matches no modular specifier, so the ban is
    // emitted, resolves, and fires on nothing.
    const selfOnly = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        modules: [{ name: 'Fighter', does: 'the ship' }],
        layers: [
          { name: 'views', does: 'screens' },
          { name: 'contexts', does: 'providers', allowedImporters: [{ layer: 'views', selfOnly: true }] },
        ],
      },
    });

    const entry = emitLint(selfOnly).find((item) => item.rules?.['no-restricted-syntax']);

    const selectors = (entry?.rules?.['no-restricted-syntax'] as [unknown, { selector: string }])
      .slice(1)
      .map((item) => (item as { selector: string }).selector);

    expect(selectors[0]).toContain('~app\\u002FFighter\\u002Fcontexts\\u002F');
  });
});

describe('emitLint · the zones no layer glob reaches', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'routing', layers: false, imports: ['GameStage'] },
        { name: 'GameStage', does: 'the run', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets', owns: [{ global: 'requestAnimationFrame' }, 'rbush'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  });

  const entryFor = (glob: string) =>
    emitLint(modular).find((entry) => entry.files?.[0] === glob);

  const groupsOf = (glob: string) => (
    entryFor(glob)?.rules?.['no-restricted-imports'] as [unknown, { patterns: { group: string[] }[] }]
  )[1].patterns.flatMap((pattern) => pattern.group);

  it('governs a layered module\'s own root, which no layer glob matches', () => {
    // Without it the module's own composition code — `Fighter.tsx`, `index.ts`
    // — is the least governed code in the module: matched by no layer entry,
    // outside every ban, while `inspect` reports its imports.
    expect(groupsOf('src/GameStage/*.{js,jsx,ts,tsx}')).toContain('~app/app');
  });

  it('governs a layers:false module entire, not just its root files', () => {
    // Root-only here would leave `app/routes/Game.tsx` outside every net — the
    // wildcard defect wearing different clothes. It opts out of the layer
    // vocabulary, not out of governance.
    expect(groupsOf('src/app/**/*.{js,jsx,ts,tsx}')).toContain('~app/Combat');
  });

  it('lets the module root reach its own layers, but not past a unit\'s entry', () => {
    // #196's acceptance asked for this in BOTH spellings and closed with it
    // true in inspect and false in lint, because the alias spelling had no
    // entry to live in. This is that entry.
    const groups = groupsOf('src/GameStage/*.{js,jsx,ts,tsx}');

    expect(groups).toContain('~app/GameStage/hooks/*/**');
    expect(groups).toContain('~app/GameStage/components/*/**');
    // The unit's entry itself stays reachable — the root composes the layers.
    expect(groups).not.toContain('~app/GameStage/hooks/**');
  });

  it('gives a layers:false module no inner-unit group — it declared no layers', () => {
    expect(groupsOf('src/app/**/*.{js,jsx,ts,tsx}').join(' ')).not.toContain('/*/**');
  });

  it('bars a module-owned primitive everywhere but its owner', () => {
    // Ownership is two-dimensional once modules exist. `validateBlueprint`
    // rejects a primitive claimed at both levels, so the two lists never
    // disagree about one name.
    const globals = entryFor('src/GameStage/*.{js,jsx,ts,tsx}')
      ?.rules?.['no-restricted-globals'] as [unknown, { name: string }] | undefined;

    expect(globals?.slice(1)).toEqual([
      { name: 'requestAnimationFrame', message: expect.stringContaining('owning layer') },
    ]);

    // …and its owner keeps it.
    expect(entryFor('src/Combat/*.{js,jsx,ts,tsx}')?.rules?.['no-restricted-globals'])
      .toBeUndefined();
  });

  it('carries the pass-through rule on every zone of a modular config', () => {
    // Module-wide, not entry-only: an inner file re-exporting Combat and the
    // entry re-exporting that inner file hands Combat's surface out anyway.
    const scoped = emitLint(modular)
      .filter((entry) => entry.rules?.['blueprint/no-module-reexport'])
      .map((entry) => entry.files?.[0]);

    expect(scoped).toContain('src/GameStage/hooks/**/*.{js,jsx,ts,tsx}');
    expect(scoped).toContain('src/GameStage/*.{js,jsx,ts,tsx}');
    expect(scoped).toContain('src/app/**/*.{js,jsx,ts,tsx}');
  });

  it('tells the rule which module it governs, so it never parses a path', () => {
    const options = (entryFor('src/GameStage/*.{js,jsx,ts,tsx}')
      ?.rules?.['blueprint/no-module-reexport'] as [unknown, Record<string, unknown>])[1];

    expect(options).toEqual({
      aliases: ['~app'],
      modules: ['app', 'GameStage', 'Combat'],
      module: 'GameStage',
    });
  });

  it('emits none of it on a flat config', () => {
    // The whole module family is additive: omit `modules` and nothing here
    // exists to emit.
    const flat = emitLint(blueprint);

    expect(flat.some((entry) => entry.rules?.['blueprint/no-module-reexport'])).toBe(false);

    expect(flat.flatMap((entry) => Object.keys(entry.rules ?? {}))).not.toContain(
      'blueprint/no-module-reexport',
    );
  });
});
