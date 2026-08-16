import stylisticPlugin from '@stylistic/eslint-plugin';
import { Linter } from 'eslint';
import importsPlugin from 'eslint-plugin-import-x';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';
import { STATEMENT_PADDING } from './patterns';

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

const linter = new Linter({ configType: 'flat' });

const COMPONENT = 'src/components/Button/Button.ts';

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

describe('emitLint · the two entries the injected gates split across', () => {
  const tsPlugin = { rules: {} };

  const spanning = emitLint(
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

  it('keeps metrics and type hygiene exempt from tests, with their own plugins', () => {
    const shared = spanning.find((item) => item.rules?.['blueprint/no-deep-watch']);

    expect(shared?.ignores).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}',
      '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);

    expect(shared?.plugins?.blueprint).toBeDefined();
    expect(shared?.plugins?.['@typescript-eslint']).toBe(tsPlugin);
  });

  it('puts the shape family on an entry that covers test files too', () => {
    // A duplicate import or a collapsed line is no easier to read in a spec file.
    const shape = spanning.find((item) => item.rules?.['import-x/no-duplicates']);

    expect(shape?.ignores).toBeUndefined();
    expect(shape?.rules?.['@stylistic/padding-line-between-statements']).toBeDefined();
    expect(shape?.plugins?.['@stylistic']).toBe(stylisticPlugin);
    expect(shape?.plugins?.['import-x']).toBe(importsPlugin);
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
