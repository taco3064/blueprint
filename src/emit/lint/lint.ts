import type { ESLint, Linter } from 'eslint';
import { activeSetting,
  aliasLayerRoots,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets } from '../../config';
import type { Blueprint, ReadSetting } from '../../config';
import { plugin } from '../../plugin';
import {
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  METRIC_GATES,
  resolveLayerFiles,
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
type ModuleLayout = 'folder' | 'flat';

/**
 * Compile a Blueprint's `architecture` into an ESLint flat config that
 * enforces the one-way dependency flow, module-entry boundaries, and package
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

  const {
    layers,
    layerFiles,
    layerFilesIgnore,
    testFiles,
    sourceRoot,
  } = architecture;

  const severity: Severity = blueprint.emit?.lint?.severity ?? 'error';

  // Each alias's layer base carries the offset from its target to the
  // source root — `'~root': '.'` bans `~root/src/views/**`, not the
  // `~root/views/**` no import ever uses (field issue #29).
  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const testGlobs = resolveTestFiles(testFiles);

  const layouts = Object.fromEntries(
    layers.map((layer) => [layer.name, getModuleShape(architecture, layer.name).layout]),
  );

  // The rule needs the entry filename to tell a sibling's front door from its
  // inside; without it a layer whose entry is not `index` reads every entry
  // import as reaching past one.
  const entries = Object.fromEntries(
    layers.map((layer) => [layer.name, getModuleShape(architecture, layer.name).entry]),
  );

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  const layerConfigs = layerImportEntries(blueprint, { severity, testGlobs, aliases, layouts });

  const allLayerFiles = [
    ...new Set(
      layers.flatMap((l) => resolveLayerFiles(l.name, framework, { layerFiles, sourceRoot })),
    ),
  ];

  // The depth-aware half of the structural rules: relative imports must not
  // leave their module. Shares inspect's resolution — see the plugin rule.
  const escapeEntry: LintConfigEntry = {
    files: allLayerFiles,
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/relative-escape': [severity, { layouts, entries }] },
  };

  return [
    ...ignoreConfig,
    ...layerConfigs,
    escapeEntry,
    ...ruleGateEntries(blueprint, testGlobs, options),
  ];
}

/**
 * One `no-restricted-imports` entry per layer — the flow ban, the module-entry
 * ban, and package / global ownership, all of which are per-layer facts. A layer
 * with exempt packages needs two entries: flat config REPLACES a rule rather than
 * merging it, so the exemption cannot be an `ignores` on a single one.
 */
function layerImportEntries(
  blueprint: Blueprint,
  shape: {
    severity: Severity;
    testGlobs: string[];
    aliases: string[];
    layouts: Record<string, ModuleLayout>;
  },
): LintConfigEntry[] {
  const { framework, architecture } = blueprint;
  const { layers, layerFiles, sourceRoot } = architecture;
  const { severity, testGlobs, aliases, layouts } = shape;
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);

  const folderLayers = layers
    .map((layer) => layer.name)
    .filter((name) => layouts[name] === 'folder');

  // Fixture roots are barred through the same structural rule per layer —
  // a separate entry would *replace* `no-restricted-imports`, not merge it.
  const fixtures = activeSetting(blueprint.rules?.fixtureImports)
    ? aliases.flatMap((a) => [`${a}/fixtures`, `${a}/fixtures/**`])
    : [];

  return layers.flatMap((layer) => {
    const files = resolveLayerFiles(layer.name, framework, { layerFiles, sourceRoot });
    const forbidden = getForbiddenLayers(architecture, layer.name);
    const disabledPackages = packageRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const disabledGlobals = globalRules.filter((rule) => !rule.allowedIn.includes(layer.name));

    const selfOnlyTargets = getSelfOnlyTargets(architecture, layer.name);

    const structural = buildStructuralPatterns({
      layer: layer.name,
      aliases,
      forbidden,
      moduleLayout: layouts[layer.name],
      folderTargets: folderLayers.filter(
        (name) => name !== layer.name && !forbidden.includes(name),
      ),
      fixtures,
    });

    const syntaxRules = selfOnlyTargets.flatMap((target) =>
      aliases.map((a) => ({
        selector: selfOnlyReexportSelector(a, target),
        message: `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`,
      })),
    );

    const buildRules = (packages: PackageRule[]): Linter.RulesRecord => {
      const { paths, patterns } = buildPackagePatterns(packages);

      return {
        // By contract these are rule entries (validated to spare the managed rules).
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
      // All files (incl. exempt): only the non-exempt package restrictions.
      { files, ignores: testGlobs, rules: buildRules(nonExempt) },
      // Non-exempt files only: the full set of package restrictions.
      { files, ignores: [...exemptPatterns, ...testGlobs], rules: buildRules(disabledPackages) },
    ];
  });
}

/**
 * Entries for the known `blueprint.rules` ids — where a rule record stops being
 * documentation and becomes a lint gate. The caller-injected gates emit nothing
 * without their plugin. Test files are exempt here as far as the globs reach, because
 * metrics scream on tests; the shape family is the exception and has its own entry.
 * Unknown ids stay docs-only, as do `cycles` and `deadCode`.
 */
function ruleGateEntries(
  blueprint: Blueprint,
  testGlobs: string[],
  options: EmitLintOptions,
): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const { layers, layerFiles, sourceRoot } = architecture;

  const sharedFiles = [
    ...new Set(
      layers.flatMap((l) => resolveLayerFiles(l.name, framework, { layerFiles, sourceRoot })),
    ),
  ];

  return [
    ...sharedEntry(sharedRules(blueprint, options), { files: sharedFiles, testGlobs }, options),
    ...shapeEntry(blueprint, sharedFiles, options),
    ...testFilenameEntry(rules, testGlobs),
    ...typedefOnlyEntry(rules, testGlobs),
    ...usePrefixEntry(blueprint, testGlobs),
  ];
}

/**
 * Every gate that lands in the one shared entry, in emitted order. No @stylistic
 * rule is here — the whole shape family lives in its own, test-inclusive entry.
 */
function sharedRules(blueprint: Blueprint, options: EmitLintOptions): Linter.RulesRecord {
  const { framework, rules } = blueprint;
  const explicitAny = activeSetting(rules?.explicitAny);
  const deepWatch = activeSetting(rules?.deepWatch);
  const usePrefixReactivity = activeSetting(rules?.usePrefixReactivity);

  return {
    ...metricRules(rules),
    ...unusedVarsRules(activeSetting(rules?.unusedVars), options.typescript),
    // No core twin exists — `any` cannot appear in JS source, so there is
    // nothing to fall back to when the plugin is absent (unlike unusedVars).
    ...(explicitAny && options.typescript
      ? { '@typescript-eslint/no-explicit-any': explicitAny.tier }
      : {}),
    ...(deepWatch && framework !== 'react' ? { 'blueprint/no-deep-watch': deepWatch.tier } : {}),
    ...(usePrefixReactivity
      ? { 'blueprint/use-prefix-needs-reactivity': usePrefixReactivity.tier }
      : {}),
  };
}

/** The numeric gates, each carrying its declared value or the table's fallback. */
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

/**
 * Core `no-unused-vars` false-flags TS enum members and type parameters — with the
 * caller-injected plugin, the TS-aware twin takes over and the core one goes off.
 */
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

/** The one entry the shared rules ride, with only the plugins they actually need. */
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

/**
 * `testGlobs.length` because this entry's `files` IS the test globs, and
 * `testFiles: []` makes it `files: []`, which ESLint rejects outright — the config
 * validated, inspect ran clean, and `impact` died on the emitted output (field run
 * #150). `unavailableGate` reports the drop, so it is not silent.
 */
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

/** Scoped to JavaScript source: a `.ts` file of types is the TS way to say it. */
function typedefOnlyEntry(rules: Blueprint['rules'], testGlobs: string[]): LintConfigEntry[] {
  const typedefOnlyFile = activeSetting(rules?.typedefOnlyFile);

  if (!typedefOnlyFile) {
    return [];
  }

  return [{
    files: ['src/**/*.js'],
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/no-typedef-only-file': typedefOnlyFile.tier },
  }];
}

/** The prefix gate, scoped to the one layer it names (default `hooks`). */
function usePrefixEntry(blueprint: Blueprint, testGlobs: string[]): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const { layerFiles, sourceRoot } = architecture;
  const usePrefix = activeSetting(rules?.usePrefix);

  if (!usePrefix) {
    return [];
  }

  const layer = (usePrefix.opts.layer as string | undefined) ?? 'hooks';
  const prefix = (usePrefix.opts.prefix as string | undefined) ?? 'use';

  return [{
    files: resolveLayerFiles(layer, framework, { layerFiles, sourceRoot }),
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/use-prefix': [usePrefix.tier, { prefix }] },
  }];
}

/** The `customize` factory `@stylistic/eslint-plugin` hangs off its configs. */
interface StylisticPlugin {
  configs?: { customize?: (options: Record<string, unknown>) => { rules?: Linter.RulesRecord } };
}

/**
 * The one entry governing the SHAPE of any source file, and the only gate that does
 * not exempt tests — indentation and quoting do not get easier to read there.
 *
 * Order inside the record is load-bearing: `customize()` already carries
 * `max-statements-per-line`, so the explicit gate is written after it to win —
 * including when it is `off`, which the bundle would otherwise switch back on.
 */
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

/** Every shape gate that resolved to something, in the order the entry carries them. */
function shapeRules(rules: Blueprint['rules'], options: EmitLintOptions): Linter.RulesRecord {
  const shape: Linter.RulesRecord = {};
  const codeStyle = activeSetting(rules?.codeStyle);

  if (codeStyle && options.stylistic) {
    Object.assign(shape, codeStyleRules(codeStyle, options.stylistic));
  }

  // Assigned after the bundle so the explicit gate wins — including when it is
  // `off`, which `customize()` would otherwise switch back on. An existing key
  // keeps its position, so the record's order does not move.
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

/**
 * Hard-wired max: 1 — the gate defines what a line IS for `maxLines`, and a
 * threshold above 1 defines nothing. Declared-but-off only emits when `codeStyle`
 * is on, because that is the bundle it has to switch back off.
 */
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

/**
 * The `codeStyle` bundle: `@stylistic`'s own `customize()` set plus the three rules
 * it leaves out. The factory rather than a hand-listed subset, because a subset
 * leaves gaps — one policed statements-per-line while allowing zero indentation.
 */
function codeStyleRules(gate: ReadSetting, stylistic: ESLint.Plugin): Linter.RulesRecord {
  const customize = (stylistic as StylisticPlugin).configs?.customize;

  if (typeof customize !== 'function') {
    // Emitting nothing here would be the exact failure this whole gate family
    // guards against: a declared rule that silently governs nothing.
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
    // Not exposed as knobs — blueprint's own house values. A repo that wants
    // different braces turns the gate off and declares its own set.
    arrowParens: true,
    braceStyle: '1tbs',
    commaDangle: 'always-multiline',
    blockSpacing: true,
    quoteProps: 'as-needed',
  });

  return {
    ...bundle.rules,
    // Three the factory omits. max-len has NO fixer — it reports and the code
    // must actually be restructured, which is the point.
    '@stylistic/max-len': [gate.tier, {
      code: num('maxLen', 90),
      ignoreUrls: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      // Deliberately NOT ignoring plain strings: a long line escapes a length
      // cap entirely by containing one, which is a free bypass.
      ignoreStrings: false,
    }],
    // LF everywhere. Mixed line endings are what breaks cross-platform work,
    // not LF itself. The cause of a red here is usually git's autocrlf /
    // .gitattributes, NOT the file — the gate catalog says so, since the
    // rule's own message cannot.
    '@stylistic/linebreak-style': [gate.tier, 'unix'],
    // Core, not deprecated, no plugin needed. Without it `if (x) return;`
    // counts as ONE statement and slips past max-statements-per-line.
    curly: [gate.tier, 'all'],
  };
}

/** Build the `no-restricted-globals` rule for globals this layer does not own. */
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
