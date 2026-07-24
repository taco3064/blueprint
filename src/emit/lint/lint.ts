import type { Linter } from 'eslint';
import type { Blueprint, RuleSetting, Tier } from '../../config';
import {
  aliasLayerRoots,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
} from '../../config';
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
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);

  const layouts = Object.fromEntries(
    layers.map((layer) => [layer.name, getModuleShape(architecture, layer.name).layout]),
  );

  const folderLayers = layers
    .map((layer) => layer.name)
    .filter((name) => layouts[name] === 'folder');

  // Fixture roots are barred through the same structural rule per layer —
  // a separate entry would *replace* `no-restricted-imports`, not merge it.
  const fixtures = active(blueprint.rules?.fixtureImports)
    ? aliases.flatMap((a) => [`${a}/fixtures`, `${a}/fixtures/**`])
    : [];

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  const layerConfigs = layers.flatMap((layer) => {
    const files = resolveLayerFiles(layer.name, layerFiles, framework, sourceRoot);
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

  const allLayerFiles = [
    ...new Set(layers.flatMap((l) => resolveLayerFiles(l.name, layerFiles, framework, sourceRoot))),
  ];

  // The depth-aware half of the structural rules: relative imports must not
  // leave their module. Shares inspect's resolution — see the plugin rule.
  const escapeEntry: LintConfigEntry = {
    files: allLayerFiles,
    ignores: testGlobs,
    plugins: { blueprint: plugin },
    rules: { 'blueprint/relative-escape': [severity, { layouts }] },
  };

  return [
    ...ignoreConfig,
    ...layerConfigs,
    escapeEntry,
    ...ruleGateEntries(blueprint, testGlobs, options),
  ];
}

/**
 * Entries for the known `blueprint.rules` ids — where a rule record stops
 * being documentation and becomes a lint gate. Metric ids map to built-in
 * rules; `deepWatch` / `usePrefix` ride the embedded plugin. Test files are
 * exempt (metrics scream on tests). Unknown ids stay docs-only; `cycles` /
 * `deadCode` land in the generated eslint.config (third-party plugins the
 * library itself does not depend on) and in Verify.
 */
function ruleGateEntries(
  blueprint: Blueprint,
  testGlobs: string[],
  options: EmitLintOptions,
): LintConfigEntry[] {
  const { framework, architecture, rules } = blueprint;
  const { layers, layerFiles, sourceRoot } = architecture;
  const entries: LintConfigEntry[] = [];

  const shared: Linter.RulesRecord = {};

  for (const { id, rule, fallback, wrap } of METRIC_GATES) {
    const setting = active(rules?.[id]);

    if (!setting) continue;

    const max = setting.value ?? fallback;

    shared[rule] = [setting.tier, wrap ? { max, skipBlankLines: true, skipComments: true } : max];
  }

  const unusedVars = active(rules?.unusedVars);

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

  const deepWatch = active(rules?.deepWatch);

  if (deepWatch && framework !== 'react') {
    shared['blueprint/no-deep-watch'] = deepWatch.tier;
  }

  const usePrefixReactivity = active(rules?.usePrefixReactivity);

  if (usePrefixReactivity) {
    shared['blueprint/use-prefix-needs-reactivity'] = usePrefixReactivity.tier;
  }

  const needsPlugin = Object.keys(shared).some((rule) => rule.startsWith('blueprint/'));
  const needsTs = Object.keys(shared).some((rule) => rule.startsWith('@typescript-eslint/'));

  const sharedFiles = [
    ...new Set(layers.flatMap((l) => resolveLayerFiles(l.name, layerFiles, framework, sourceRoot))),
  ];

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

  const testFilename = active(rules?.testFilename);

  if (testFilename) {
    entries.push({
      files: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/test-filename-matches-source': testFilename.tier },
    });
  }

  const typedefOnlyFile = active(rules?.typedefOnlyFile);

  if (typedefOnlyFile) {
    entries.push({
      files: ['src/**/*.js'],
      ignores: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/no-typedef-only-file': typedefOnlyFile.tier },
    });
  }

  const usePrefix = active(rules?.usePrefix);

  if (usePrefix) {
    const layer = (usePrefix.opts.layer as string | undefined) ?? 'hooks';
    const prefix = (usePrefix.opts.prefix as string | undefined) ?? 'use';

    entries.push({
      files: resolveLayerFiles(layer, layerFiles, framework, sourceRoot),
      ignores: testGlobs,
      plugins: { blueprint: plugin },
      rules: { 'blueprint/use-prefix': [usePrefix.tier, { prefix }] },
    });
  }

  return entries;
}

interface ActiveRule {
  tier: Severity;
  value?: number;
  /** The full setting object — carrier of rule-specific options (layer, prefix…). */
  opts: Record<string, unknown>;
}

/** Normalize a rule setting; null when unset or `off`. */
function active(setting: RuleSetting | undefined): ActiveRule | null {
  if (!setting) return null;

  const opts: { tier: Tier; value?: number } & Record<string, unknown>
    = typeof setting === 'string' ? { tier: setting } : setting;

  return opts.tier === 'off' ? null : { tier: opts.tier, value: opts.value, opts };
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
