import type { ESLint, Linter } from 'eslint';
import { activeSetting,
  aliasSpecifier,
  resolveArchitecture } from '../../config';
import type { AliasRoot, Blueprint, ReadSetting } from '../../config';
import { plugin } from '../../plugin';
import {
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  METRIC_GATES,
  resolveTestFiles,
  selfOnlyReexportSelector,
  STATEMENT_PADDING,
  toArray,
} from './patterns';
import type {
  EmitLintOptions,
  GlobalRule,
  LintConfig,
  LintConfigEntry,
  PackageRule,
} from './types';

type Severity = 'error' | 'warn';
type UnitLayout = 'folder' | 'file';

/**
 * Compile a Blueprint's `architecture` into an ESLint flat config that
 * enforces the one-way dependency flow, unit-entry boundaries, and package
 * / global ownership. Pure — returns the config array, writes nothing.
 * @group Emitters
 * @example
 * // eslint.config.mjs — spread into your own flat config
 * import { emitLint } from '@kekkai/blueprint';
 * import blueprint from './blueprint.config.mjs';
 *
 * export default [...emitLint(blueprint)];
 */
export function emitLint(blueprint: Blueprint, options: EmitLintOptions = {}): LintConfig {
  const { framework, architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);

  const { layerFilesIgnore, testFiles } = architecture;

  const severity: Severity = blueprint.emit?.lint?.severity ?? 'error';

  const aliases = resolved.aliases;

  const testGlobs = resolveTestFiles(testFiles);

  const layouts = Object.fromEntries(
    resolved.layers.map((layer) => [layer.name, layer.unit.layout]),
  );

  const entries = Object.fromEntries(
    resolved.layers.map((layer) => [layer.name, layer.unit.entry]),
  );

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  const layerConfigs = layerImportEntries(blueprint, { severity, testGlobs, aliases, layouts });

  const allLayerFiles = [
    ...new Set(
      resolved.layers.flatMap((layer) => resolved.layerFiles(layer.name, framework)),
    ),
  ];

  const escapeEntry: LintConfigEntry = {
    files: allLayerFiles,
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/relative-escape': [
      severity,
      { architecture },
    ] },
  };

  return [
    ...ignoreConfig,
    ...layerConfigs,
    escapeEntry,
    ...ruleGateEntries(blueprint, testGlobs, options),
  ];
}

function layerImportEntries(
  blueprint: Blueprint,
  shape: {
    severity: Severity;
    testGlobs: string[];
    aliases: AliasRoot[];
    layouts: Record<string, UnitLayout>;
  },
): LintConfigEntry[] {
  const { framework, architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const layers = resolved.layers.map((layer) => layer.definition);
  const { severity, testGlobs, aliases, layouts } = shape;
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);
  const scopes: (string | undefined)[] = resolved.moduleFirst
    ? resolved.moduleNames
    : [undefined];

  const folderLayers = layers
    .map((layer) => layer.name)
    .filter((name) => layouts[name] === 'folder');

  const fixtures = activeSetting(blueprint.rules?.fixtureImports)
    ? aliases.flatMap((root) => {
        const alias = [root.alias, ...root.prefix].join('/');

        return root.prepend?.length ? [] : [`${alias}/fixtures`, `${alias}/fixtures/**`];
      })
    : [];

  return scopes.flatMap((module) => layers.flatMap((layer) => {
    const files = module === undefined
      ? resolved.layerFiles(layer.name, framework)
      : resolved.moduleLayerFiles(module, layer.name, framework);

    const forbidden = resolved.forbiddenLayers(layer.name);
    const disabledPackages = packageRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const disabledGlobals = globalRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const selfOnlyTargets = resolved.selfOnlyTargets(layer.name);

    const structural = buildStructuralPatterns({
      layer: layer.name,
      module,
      modules: resolved.moduleNames,
      aliases,
      forbidden,
      unitLayout: layouts[layer.name],
      folderTargets: folderLayers.filter(
        (name) => name !== layer.name && !forbidden.includes(name),
      ),
      fixtures,
    });

    const syntaxModules: (string | undefined)[] = resolved.moduleFirst
      ? resolved.moduleNames
      : [undefined];

    const syntaxRules = selfOnlyTargets.flatMap((target) =>
      syntaxModules.flatMap((targetModule) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, target, targetModule);

        return specifier === null
          ? []
          : [{
              selector: selfOnlyReexportSelector(specifier),
              message: `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`,
            }];
      })),
    );

    const buildRules = (packages: PackageRule[]): Linter.RulesRecord => {
      const { paths, patterns } = buildPackagePatterns(packages);

      return {
        ...(layer.lintOverrides as Linter.RulesRecord),
        'no-restricted-imports': [
          severity,
          { patterns: [...structural, ...patterns], ...(paths.length ? { paths } : {}) },
        ],
        ...(syntaxRules.length ? { 'no-restricted-syntax': [severity, ...syntaxRules] } : {}),
        ...buildGlobalRule(disabledGlobals, severity),
      };
    };

    const exemptPatterns = [
      ...new Set(disabledPackages.flatMap((rule) => rule.exempt ?? []).filter(Boolean)),
    ];

    if (!exemptPatterns.length) {
      return [{ files, ignores: testGlobs, rules: buildRules(disabledPackages) }];
    }

    const nonExempt = disabledPackages.filter((rule) => !rule.exempt?.length);

    return [
      { files, ignores: testGlobs, rules: buildRules(nonExempt) },
      { files, ignores: [...exemptPatterns, ...testGlobs], rules: buildRules(disabledPackages) },
    ];
  }));
}

function ruleGateEntries(
  blueprint: Blueprint,
  testGlobs: string[],
  options: EmitLintOptions,
): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const resolved = resolveArchitecture(architecture);

  const sharedFiles = [
    ...new Set(
      resolved.layers.flatMap((layer) => resolved.layerFiles(layer.name, framework)),
    ),
  ];

  return [
    ...sharedEntry(sharedRules(blueprint, options), { files: sharedFiles, testGlobs }, options),
    ...shapeEntry(blueprint, sharedFiles, options),
    ...testFilenameEntry(rules, testGlobs),
    ...typedefOnlyEntry(architecture, rules, testGlobs),
    ...usePrefixEntry(blueprint, testGlobs),
  ];
}

function sharedRules(blueprint: Blueprint, options: EmitLintOptions): Linter.RulesRecord {
  const { framework, rules } = blueprint;
  const explicitAny = activeSetting(rules?.explicitAny);
  const deepWatch = activeSetting(rules?.deepWatch);
  const usePrefixReactivity = activeSetting(rules?.usePrefixReactivity);

  return {
    ...metricRules(rules),
    ...unusedVarsRules(activeSetting(rules?.unusedVars), options.typescript),

    ...(explicitAny && options.typescript
      ? { '@typescript-eslint/no-explicit-any': explicitAny.tier }
      : {}),
    ...(deepWatch && framework !== 'react' ? { 'blueprint/no-deep-watch': deepWatch.tier } : {}),
    ...(usePrefixReactivity
      ? { 'blueprint/use-prefix-needs-reactivity': usePrefixReactivity.tier }
      : {}),
  };
}

function metricRules(rules: Blueprint['rules']): Linter.RulesRecord {
  const record: Linter.RulesRecord = {};

  for (const { id, rule, fallback, wrap } of METRIC_GATES) {
    const setting = activeSetting(rules?.[id]);

    if (!setting) {
      continue;
    }

    const max = setting.value ?? fallback;

    record[rule] = [setting.tier, wrap ? { max, skipBlankLines: true, skipComments: true } : max];
  }

  return record;
}

function unusedVarsRules(
  setting: ReadSetting | null,
  typescript: EmitLintOptions['typescript'],
): Linter.RulesRecord {
  if (!setting) {
    return {};
  }

  if (!typescript) {
    return { 'no-unused-vars': [setting.tier, { argsIgnorePattern: '^_' }] };
  }

  return {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [setting.tier, { argsIgnorePattern: '^_' }],
  };
}

function sharedEntry(
  shared: Linter.RulesRecord,
  scope: { files: string[]; testGlobs: string[] },
  options: EmitLintOptions,
): LintConfigEntry[] {
  if (!Object.keys(shared).length) {
    return [];
  }

  const needsPlugin = Object.keys(shared).some((rule) => rule.startsWith('blueprint/'));
  const needsTs = Object.keys(shared).some((rule) => rule.startsWith('@typescript-eslint/'));

  return [{
    files: scope.files,
    ignores: scope.testGlobs,
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    ...(needsPlugin || needsTs
      ? {
          plugins: {
            ...(needsPlugin ? { blueprint: plugin } : {}),
            ...(needsTs && options.typescript
              ? { '@typescript-eslint': options.typescript }
              : {}),
          },
        }
      : {}),
    rules: shared,
  }];
}

function testFilenameEntry(rules: Blueprint['rules'], testGlobs: string[]): LintConfigEntry[] {
  const testFilename = activeSetting(rules?.testFilename);

  if (!testFilename || !testGlobs.length) {
    return [];
  }

  return [{
    files: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/test-filename-matches-source': testFilename.tier },
  }];
}

function typedefOnlyEntry(
  architecture: Blueprint['architecture'],
  rules: Blueprint['rules'],
  testGlobs: string[],
): LintConfigEntry[] {
  const typedefOnlyFile = activeSetting(rules?.typedefOnlyFile);

  if (!typedefOnlyFile) {
    return [];
  }

  return [{
    files: [resolveArchitecture(architecture).sourceRoot === '.'
      ? '**/*.js'
      : `${resolveArchitecture(architecture).sourceRoot}/**/*.js`],
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/no-typedef-only-file': typedefOnlyFile.tier },
  }];
}

function usePrefixEntry(blueprint: Blueprint, testGlobs: string[]): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const usePrefix = activeSetting(rules?.usePrefix);

  if (!usePrefix) {
    return [];
  }

  const layer = (usePrefix.opts.layer as string | undefined) ?? 'hooks';
  const prefix = (usePrefix.opts.prefix as string | undefined) ?? 'use';

  return [{
    files: resolveArchitecture(architecture).layerFiles(layer, framework),
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/use-prefix': [usePrefix.tier, { prefix }] },
  }];
}

interface StylisticPlugin {
  configs?: { customize?: (options: Record<string, unknown>) => { rules?: Linter.RulesRecord } };
}

function shapeEntry(
  blueprint: Blueprint,
  files: string[],
  options: EmitLintOptions,
): LintConfigEntry[] {
  const shape = shapeRules(blueprint.rules, options);

  if (!Object.keys(shape).length) {
    return [];
  }

  const needsStylistic = Object.keys(shape).some((rule) => rule.startsWith('@stylistic/'));
  const needsImports = Object.keys(shape).some((rule) => rule.startsWith('import-x/'));

  return [{
    files,
    plugins: {
      ...(needsStylistic && options.stylistic ? { '@stylistic': options.stylistic } : {}),
      ...(needsImports && options.imports ? { 'import-x': options.imports } : {}),
    },
    rules: shape,
  }];
}

function shapeRules(rules: Blueprint['rules'], options: EmitLintOptions): Linter.RulesRecord {
  const shape: Linter.RulesRecord = {};
  const codeStyle = activeSetting(rules?.codeStyle);

  if (codeStyle && options.stylistic) {
    Object.assign(shape, codeStyleRules(codeStyle, options.stylistic));
  }

  Object.assign(shape, statementsPerLineRule(rules, options.stylistic, codeStyle !== null));

  const statementPadding = activeSetting(rules?.statementPadding);

  if (statementPadding && options.stylistic) {
    shape['@stylistic/padding-line-between-statements'] = [
      statementPadding.tier,
      ...STATEMENT_PADDING,
    ];
  }

  const importBlock = activeSetting(rules?.importBlock);

  if (importBlock && options.imports) {
    shape['import-x/first'] = importBlock.tier;
    shape['import-x/no-duplicates'] = importBlock.tier;
  }

  return shape;
}

function statementsPerLineRule(
  rules: Blueprint['rules'],
  stylistic: EmitLintOptions['stylistic'],
  hasCodeStyle: boolean,
): Linter.RulesRecord {
  const declared = rules?.statementsPerLine;

  if (declared === undefined || !stylistic) {
    return {};
  }

  const on = activeSetting(declared);

  if (on) {
    return { '@stylistic/max-statements-per-line': [on.tier, { max: 1 }] };
  }

  return hasCodeStyle ? { '@stylistic/max-statements-per-line': 'off' } : {};
}

function codeStyleRules(gate: ReadSetting, stylistic: ESLint.Plugin): Linter.RulesRecord {
  const customize = (stylistic as StylisticPlugin).configs?.customize;

  if (typeof customize !== 'function') {
    throw new Error(
      'blueprint: rules.codeStyle needs @stylistic/eslint-plugin\'s configs.customize() '
      + 'factory, and the plugin passed as emitLint\'s `stylistic` option does not expose '
      + 'it. Pass the real plugin (import stylistic from \'@stylistic/eslint-plugin\'), or '
      + 'set rules.codeStyle to \'off\'.',
    );
  }

  const opts = gate.opts;

  const num = (key: string, fallback: number) =>
    (typeof opts[key] === 'number' ? opts[key] as number : fallback);

  const bundle = customize({
    indent: num('indent', 2),
    quotes: opts.quotes === 'double' ? 'double' : 'single',
    semi: opts.semi !== false,

    arrowParens: true,
    braceStyle: '1tbs',
    commaDangle: 'always-multiline',
    blockSpacing: true,
    quoteProps: 'as-needed',
  });

  return {
    ...bundle.rules,

    '@stylistic/max-len': [gate.tier, {
      code: num('maxLen', 90),
      ignoreUrls: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,

      ignoreStrings: false,
    }],

    '@stylistic/linebreak-style': [gate.tier, 'unix'],

    curly: [gate.tier, 'all'],
  };
}

function buildGlobalRule(disabled: GlobalRule[], severity: Severity): Linter.RulesRecord {
  if (!disabled.length) {
    return {};
  }

  return {
    'no-restricted-globals': [
      severity,
      ...disabled.map((rule) => ({
        name: rule.global,
        message: `\n🚫 Use of "${rule.global}" is restricted to its owning layer.`,
      })),
    ],
  };
}
