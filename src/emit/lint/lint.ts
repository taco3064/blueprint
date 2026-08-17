import type { ESLint, Linter } from 'eslint';
import { activeSetting, getFolderShape, getModules } from '../../config';
import type { ArchitectureDef, Blueprint, ReadSetting } from '../../config';
import { plugin } from '../../plugin';
import {
  barredIn,
  netModuleSelfOnly,
  netPatterns,
  netSelfBanPaths,
  netSelfOnly,
  resolveBanScope,
} from './bans';
import type { BanScope } from './bans';
import { METRIC_GATES, STATEMENT_PADDING } from './gates';
import { allNetFiles, resolveFileNets } from './nets';
import type { FileNet } from './nets';
import {
  buildPackagePatterns,
  netIgnores,
  ownerPhrase,
  resolveLayerFiles,
  resolveTestFiles,
  selfOnlyModuleReexportSelector,
  selfOnlyReexportSelector,
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
type FolderLayout = 'folder' | 'flat';

/** Everything a net's rules compile from, resolved once for the whole config. */
interface NetContext {
  severity: Severity;
  testGlobs: string[];
  architecture: ArchitectureDef;
  banScope: BanScope;
}

/**
 * Compile a Blueprint's `architecture` into an ESLint flat config that
 * enforces the one-way dependency flow, folder-entry boundaries, and package
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
  const testGlobs = resolveTestFiles(testFiles);

  // The one resolution of what this blueprint forbids — every net reads the
  // same facts, so the bans written here can never disagree with themselves.
  const banScope = resolveBanScope(blueprint);
  const context: NetContext = { severity, testGlobs, architecture, banScope };

  // The rule needs the entry filename to tell a sibling's front door from its
  // inside; without it a layer whose entry is not `index` reads every entry
  // import as reaching past one.
  const entries = Object.fromEntries(
    layers.map((layer) => [layer.name, getFolderShape(architecture, layer.name).entry]),
  );

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  return [
    ...ignoreConfig,
    // One `no-restricted-imports` entry per governed file group — the flow ban,
    // the folder-entry ban, and package / global ownership, all of which are
    // facts about the group rather than about the file. Flat, a group is a
    // layer. Modular, it is one layer inside one module, or a module's own
    // root files.
    ...resolveFileNets(architecture, framework).flatMap((net) => netEntries(net, context)),
    ...escapeEntries(blueprint, { severity, testGlobs, layouts: banScope.layouts, entries }),
    ...ruleGateEntries(blueprint, testGlobs, options),
  ];
}

/**
 * The one or two entries a single file group needs. A group with exempt packages
 * needs two: flat config REPLACES a rule rather than merging it, so the exemption
 * cannot be an `ignores` on a single one.
 */
function netEntries(net: FileNet, context: NetContext): LintConfigEntry[] {
  const { severity, testGlobs, architecture, banScope } = context;

  const disabledPackages = banScope.packageRules.filter((rule) => barredIn(net, rule));
  const disabledGlobals = banScope.globalRules.filter((rule) => barredIn(net, rule));
  const structural = netPatterns(net, banScope);
  const selfBanPaths = netSelfBanPaths(net, banScope);

  const syntaxRules = [
    ...netSelfOnly(net, architecture).flatMap(({ target, path }) =>
      banScope.aliases.map((a) => ({
        selector: selfOnlyReexportSelector(a, path),
        message: `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`,
      })),
    ),
    // A module's own bare entry IS its re-exportable spelling, so its selfOnly
    // ban needs the selector that also matches that exact form — the layer
    // selector only ever matches one segment deeper.
    ...netModuleSelfOnly(net, architecture).flatMap(({ target, path }) =>
      banScope.aliases.map((a) => ({
        selector: selfOnlyModuleReexportSelector(a, path),
        message: `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`,
      })),
    ),
  ];

  // `lintOverrides` lives on the shared layer declaration, keyed by its bare
  // name — a module net's `layer` names the same shared entry, so the override
  // cascades into every module that nests it, exactly like the layer itself.
  const overrides = net.layer === null
    ? undefined
    : architecture.layers.find((l) => l.name === net.layer)?.lintOverrides;

  const buildRules = (packages: PackageRule[]): Linter.RulesRecord => {
    const { paths, patterns } = buildPackagePatterns(packages);
    const allPaths = [...selfBanPaths, ...paths];

    return {
      // By contract these are rule entries (validated to spare the managed rules).
      ...(overrides as Linter.RulesRecord),
      'no-restricted-imports': [
        severity,
        { patterns: [...structural, ...patterns], ...(allPaths.length ? { paths: allPaths } : {}) },
      ],
      ...(syntaxRules.length ? { 'no-restricted-syntax': [severity, ...syntaxRules] } : {}),
      ...buildGlobalRule(disabledGlobals, severity),
    };
  };

  const restrictedIgnores = netIgnores(disabledPackages, testGlobs);

  if (!restrictedIgnores) {
    return [{ files: net.files, ignores: testGlobs, rules: buildRules(disabledPackages) }];
  }

  const nonExempt = disabledPackages.filter((rule) => !rule.exempt?.length);

  return [
    // All files (incl. exempt): only the non-exempt package restrictions.
    { files: net.files, ignores: testGlobs, rules: buildRules(nonExempt) },
    // Non-exempt files only: the full set of package restrictions. Its `ignores`
    // is not built here — `inspect` reads the same list to decide the same thing,
    // and two spellings of one ordered list is a false negative waiting for a
    // `testFiles` negation to arrive.
    { files: net.files, ignores: restrictedIgnores, rules: buildRules(disabledPackages) },
  ];
}

/**
 * The depth-aware half of the structural rules: relative imports must not leave
 * their folder. Shares inspect's resolution — see the plugin rule.
 *
 * Modular, one entry per module, each naming the module its files sit in: the
 * rule's segment math is off by one without it, reading the module name where
 * the layer should be. Scoping `files` per module is what lets a single `root`
 * option be right for every file the entry reaches.
 */
function escapeEntries(
  blueprint: Blueprint,
  shape: {
    severity: Severity;
    testGlobs: string[];
    layouts: Record<string, FolderLayout>;
    entries: Record<string, string>;
  },
): LintConfigEntry[] {
  const { framework, architecture } = blueprint;
  const { severity, testGlobs, layouts, entries } = shape;
  const nets = resolveFileNets(architecture, framework);
  const modules = getModules(architecture);
  const { sourceRoot } = architecture;

  const entry = (files: string[], root?: string): LintConfigEntry => ({
    files,
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: {
      'blueprint/relative-escape': [
        severity,
        { layouts, entries, ...(root ? { root } : {}), ...(sourceRoot ? { sourceRoot } : {}) },
      ],
    },
  });

  if (!modules.length) {
    return [entry([...new Set(nets.flatMap((net) => net.files))])];
  }

  return modules.map((module) => entry(
    [...new Set(nets.filter((net) => net.module === module.name).flatMap((net) => net.files))],
    module.name,
  ));
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
  const sharedFiles = allNetFiles(architecture, framework);

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

/**
 * The prefix gate, scoped to the one layer it names (default `hooks`) — through
 * the nets rather than the bare layer glob, so under a modular structure it
 * reaches that layer inside every module instead of a `src/hooks/` nobody has.
 */
function usePrefixEntry(blueprint: Blueprint, testGlobs: string[]): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const { layerFiles, sourceRoot } = architecture;
  const usePrefix = activeSetting(rules?.usePrefix);

  if (!usePrefix) {
    return [];
  }

  const layer = (usePrefix.opts.layer as string | undefined) ?? 'hooks';
  const prefix = (usePrefix.opts.prefix as string | undefined) ?? 'use';

  const nets = resolveFileNets(architecture, framework)
    .filter((net) => net.layer === layer)
    .flatMap((net) => net.files);

  // A layer with no net at all is one the blueprint does not declare, and
  // `validateBlueprint` refuses that config — but `emitLint` is callable
  // without it, and `files: []` is what ESLint rejects outright.
  const files = nets.length
    ? [...new Set(nets)]
    : resolveLayerFiles(layer, framework, { layerFiles, sourceRoot });

  return [{
    files,
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
        // Named, not "its owning layer": a global declared on a module is not in
        // `architecture.layers`, and that sentence sends the reader to the wrong half
        // of their own config looking for a declaration that was never there.
        message: `\n🚫 Use of "${rule.global}" is restricted to ${ownerPhrase(rule)}.`,
      })),
    ],
  };
}
