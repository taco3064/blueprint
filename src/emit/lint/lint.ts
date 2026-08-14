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
  resolveGovernedFiles,
  resolveLayerFiles,
  resolveTestFiles,
  selfOnlyReexportSelector,
  STATEMENT_PADDING,
  toArray,
} from './patterns';
import type { EmitLintOptions, GlobalRule, LintConfig, LintConfigEntry, PackageRule } from './types';

type Severity = 'error' | 'warn';

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

  const { layers, layerFilesIgnore, testFiles } = architecture;

  const severity: Severity = blueprint.emit?.lint?.severity ?? 'error';

  // Each alias's layer base carries the offset from its target to the
  // source root — `'~root': '.'` bans `~root/src/views/**`, not the
  // `~root/views/**` no import ever uses (field issue #29).
  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const testGlobs = resolveTestFiles(testFiles);
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);

  const layouts = Object.fromEntries(
    layers.map((layer) => [layer.name, getModuleShape(architecture, layer.name).layout]),
  );

  // The rule needs the entry filename to tell a sibling's front door from its
  // inside; without it a layer whose entry is not `index` reads every entry
  // import as reaching past one.
  const entries = Object.fromEntries(
    layers.map((layer) => [layer.name, getModuleShape(architecture, layer.name).entry]),
  );

  const folderLayers = layers
    .map((layer) => layer.name)
    .filter((name) => layouts[name] === 'folder');

  // Fixture roots are barred through the same structural rule per layer —
  // a separate entry would *replace* `no-restricted-imports`, not merge it.
  const fixtures = activeSetting(blueprint.rules?.fixtureImports)
    ? aliases.flatMap((a) => [`${a}/fixtures`, `${a}/fixtures/**`])
    : [];

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  const layerConfigs = layers.flatMap((layer) => {
    const files = resolveLayerFiles(layer.name, architecture, framework);
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

  const governed = resolveGovernedFiles(architecture, framework);

  // The depth-aware half of the structural rules: relative imports must not
  // leave their module. Shares inspect's resolution — see the plugin rule.
  const escapeEntry: LintConfigEntry = {
    files: governed,
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
 * Entries for the known `blueprint.rules` ids — where a rule record stops being
 * documentation and becomes a lint gate. The caller-injected gates emit nothing
 * without their plugin. Test files are exempt here because metrics scream on tests;
 * the shape family is the exception and has its own entry. Unknown ids stay
 * docs-only, as do `cycles` and `deadCode`.
 */
function ruleGateEntries(
  blueprint: Blueprint,
  testGlobs: string[],
  options: EmitLintOptions,
): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const entries: LintConfigEntry[] = [];

  const shared: Linter.RulesRecord = {};

  for (const { id, rule, fallback, wrap } of METRIC_GATES) {
    const setting = activeSetting(rules?.[id]);

    if (!setting) continue;

    const max = setting.value ?? fallback;

    shared[rule] = [setting.tier, wrap ? { max, skipBlankLines: true, skipComments: true } : max];
  }

  const unusedVars = activeSetting(rules?.unusedVars);

  if (unusedVars) {
    if (options.typescript) {
      // Core no-unused-vars false-flags TS enum members and type parameters —
      // with the caller-injected plugin, the TS-aware twin takes over.
      shared['no-unused-vars'] = 'off';
      shared['@typescript-eslint/no-unused-vars'] = [unusedVars.tier, { argsIgnorePattern: '^_' }];
    } else {
      shared['no-unused-vars'] = [unusedVars.tier, { argsIgnorePattern: '^_' }];
    }
  }

  // No core twin exists — `any` cannot appear in JS source, so there is
  // nothing to fall back to when the plugin is absent (unlike unusedVars).
  const explicitAny = activeSetting(rules?.explicitAny);

  if (explicitAny && options.typescript) {
    shared['@typescript-eslint/no-explicit-any'] = explicitAny.tier;
  }

  const deepWatch = activeSetting(rules?.deepWatch);

  if (deepWatch && framework !== 'react') {
    shared['blueprint/no-deep-watch'] = deepWatch.tier;
  }

  const usePrefixReactivity = activeSetting(rules?.usePrefixReactivity);

  if (usePrefixReactivity) {
    shared['blueprint/use-prefix-needs-reactivity'] = usePrefixReactivity.tier;
  }

  // No @stylistic rule reaches this entry — the whole shape family lives in
  // its own, test-inclusive one (see shapeEntry).
  const needsPlugin = Object.keys(shared).some((rule) => rule.startsWith('blueprint/'));
  const needsTs = Object.keys(shared).some((rule) => rule.startsWith('@typescript-eslint/'));

  const sharedFiles = resolveGovernedFiles(architecture, framework);

  if (Object.keys(shared).length) {
    entries.push({
      files: sharedFiles,
      ignores: testGlobs,
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
    });
  }

  entries.push(...shapeEntry(blueprint, sharedFiles, options));

  const testFilename = activeSetting(rules?.testFilename);

  // `testGlobs.length` because this entry's `files` IS the test globs, and
  // `testFiles: []` makes it `files: []`, which ESLint rejects outright — the config
  // validated, inspect ran clean, and `impact` died on the emitted output (field run
  // #150). `unavailableGate` reports the drop, so it is not silent.
  if (testFilename && testGlobs.length) {
    entries.push({
      files: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/test-filename-matches-source': testFilename.tier },
    });
  }

  const typedefOnlyFile = activeSetting(rules?.typedefOnlyFile);

  if (typedefOnlyFile) {
    entries.push({
      files: ['src/**/*.js'],
      ignores: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/no-typedef-only-file': typedefOnlyFile.tier },
    });
  }

  const usePrefix = activeSetting(rules?.usePrefix);

  if (usePrefix) {
    const layer = (usePrefix.opts.layer as string | undefined) ?? 'hooks';
    const prefix = (usePrefix.opts.prefix as string | undefined) ?? 'use';

    entries.push({
      files: resolveLayerFiles(layer, architecture, framework),
      ignores: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/use-prefix': [usePrefix.tier, { prefix }] },
    });
  }

  return entries;
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
  const { rules } = blueprint;
  const shape: Linter.RulesRecord = {};

  const codeStyle = activeSetting(rules?.codeStyle);

  if (codeStyle && options.stylistic) {
    Object.assign(shape, codeStyleRules(codeStyle, options.stylistic));
  }

  const statementsPerLine = rules?.statementsPerLine;

  if (statementsPerLine !== undefined && options.stylistic) {
    const on = activeSetting(statementsPerLine);

    if (on) {
      // Hard-wired max: 1 — the gate defines what a line IS for `maxLines`,
      // and a threshold above 1 defines nothing.
      shape['@stylistic/max-statements-per-line'] = [on.tier, { max: 1 }];
    } else if (codeStyle) {
      shape['@stylistic/max-statements-per-line'] = 'off';
    }
  }

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

  if (!Object.keys(shape).length) return [];

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
  if (!disabled.length) return {};

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
