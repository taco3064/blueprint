import type { Blueprint } from '../../config/types';
import { deriveEdges, getForbiddenLayers } from '../../config/graph';
import {
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  resolveLayerFiles,
  selfOnlyReexportSelector,
  toArray,
} from './utils';
import type { GlobalRule, LintConfig, LintConfigEntry, PackageRule } from './types';

type Severity = 'error' | 'warn';

/**
 * Compile a Blueprint's `architecture` into an ESLint flat config that
 * enforces the one-way dependency flow, module-entry boundaries, and package
 * / global ownership. Pure — returns the config array, writes nothing.
 */
export function emitLint(blueprint: Blueprint): LintConfig {
  const { framework, architecture } = blueprint;

  const { alias, additionalAliases, layers, module, layerFiles, layerFilesIgnore } =
    architecture;

  const severity: Severity = blueprint.emit?.lint?.severity ?? 'error';

  const layerNames = layers.map((layer) => layer.name);
  const aliases = [alias, ...Object.keys(additionalAliases ?? {})];
  const edges = deriveEdges(architecture);
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);

  const ignoreConfig: LintConfigEntry[] = layerFilesIgnore
    ? [{ ignores: toArray(layerFilesIgnore) }]
    : [];

  const layerConfigs = layers.flatMap((layer) => {
    const files = resolveLayerFiles(layer.name, layerFiles, framework);
    const forbidden = getForbiddenLayers(edges, layerNames, layer.name);
    const disabledPackages = packageRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const disabledGlobals = globalRules.filter((rule) => !rule.allowedIn.includes(layer.name));

    const selfOnlyTargets = edges
      .filter((edge) => edge.from === layer.name && edge.selfOnly)
      .map((edge) => edge.to);

    const structural = buildStructuralPatterns({
      layer: layer.name,
      aliases,
      forbidden,
      moduleLayout: module.layout,
    });

    const syntaxRules = selfOnlyTargets.flatMap((target) =>
      aliases.map((a) => ({
        selector: selfOnlyReexportSelector(a, target),
        message: `\n🚫 Cannot re-export from "${target}" — a selfOnly dependency must not be exposed to callers.`,
      })),
    );

    const buildRules = (packages: PackageRule[]): Record<string, unknown> => {
      const { paths, patterns } = buildPackagePatterns(packages);

      return {
        ...layer.lintOverrides,
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
      return [{ files, rules: buildRules(disabledPackages) }];
    }

    const nonExempt = disabledPackages.filter((rule) => !rule.exempt?.length);

    return [
      // All files (incl. exempt): only the non-exempt package restrictions.
      { files, rules: buildRules(nonExempt) },
      // Non-exempt files only: the full set of package restrictions.
      { files, ignores: exemptPatterns, rules: buildRules(disabledPackages) },
    ];
  });

  return [...ignoreConfig, ...layerConfigs];
}

/** Build the `no-restricted-globals` rule for globals this layer does not own. */
function buildGlobalRule(disabled: GlobalRule[], severity: Severity): Record<string, unknown> {
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
