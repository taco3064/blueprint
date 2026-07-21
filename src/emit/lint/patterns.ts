import type { Framework, LayerDef, OwnedPackage } from '../../config';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/g;

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

/** The default `{layer}` glob for a framework under a given source root. */
function defaultGlob(framework: Framework, sourceRoot: string): string {
  const prefix = sourceRoot === '.' ? '' : `${sourceRoot}/`;

  return `${prefix}{layer}/**/*.{${FRAMEWORK_EXTS[framework]}}`;
}

const DEFAULT_TEST_FILES = [
  '**/*.test.{js,jsx,ts,tsx,vue}',
  '**/*.spec.{js,jsx,ts,tsx,vue}',
];

/** Resolve the test-file globs, defaulting to the `*.test.* / *.spec.*` pair. */
export function resolveTestFiles(testFiles: string | string[] | undefined): string[] {
  return testFiles === undefined ? DEFAULT_TEST_FILES : toArray(testFiles);
}

/** Coerce a `string | string[]` option to an array. */
export function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * The built-in metric gates: rules id → ESLint rule + default threshold.
 * `wrap` marks the rules whose option is `{ max }` with comment skipping.
 */
export const METRIC_GATES = [
  { id: 'maxLines', rule: 'max-lines', fallback: 400, wrap: true },
  { id: 'maxLinesPerFunction', rule: 'max-lines-per-function', fallback: 100, wrap: true },
  { id: 'maxParams', rule: 'max-params', fallback: 3, wrap: false },
  { id: 'maxStatements', rule: 'max-statements', fallback: 15, wrap: false },
  { id: 'complexity', rule: 'complexity', fallback: 12, wrap: false },
] as const;

/**
 * The rule ids a machine actually gates out of the box: the metric family and
 * plugin rules land in the emitted ESLint config; `cycles` lands in
 * `inspect` (its `cycle` finding — `import/no-cycle` was dropped from the
 * generated config as a slow re-check of the same graph). Everything else —
 * `deadCode`, unknown ids — is documentation, and the agent contract must not
 * call it a hard gate. Lives in this leaf (not lint.ts) so inspect can count
 * active gates without closing the emit → plugin → inspect module cycle.
 */
export const LINT_GATED_RULE_IDS = [
  ...METRIC_GATES.map((gate) => gate.id),
  'unusedVars',
  'fixtureImports',
  'deepWatch',
  'usePrefix',
  'usePrefixReactivity',
  'testFilename',
  'typedefOnlyFile',
  'cycles',
];

/**
 * Resolve a layer's lint file globs. An explicit `layerFiles` wins as-is;
 * otherwise the default is derived from `framework` and `sourceRoot`.
 */
export function resolveLayerFiles(
  layer: string,
  layerFiles: string | string[] | undefined,
  framework: Framework,
  sourceRoot = 'src',
): string[] {
  const globs
    = layerFiles === undefined ? [defaultGlob(framework, sourceRoot)] : toArray(layerFiles);

  return globs.map((glob) => glob.replace(LAYER_PLACEHOLDER, layer));
}

/** Group layers' package `owns` by signature; merge which layers allow each. */
export function derivePackageRules(layers: LayerDef[]): PackageRule[] {
  const byKey = new Map<string, PackageRule>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      if (typeof primitive !== 'string' && 'global' in primitive) continue;

      const pkg: OwnedPackage
        = typeof primitive === 'string' ? { package: primitive } : primitive;

      const key = [
        pkg.package,
        [...(pkg.imports ?? [])].sort().join(','),
        pkg.pattern ? 'glob' : 'path',
        [...(pkg.exempt ?? [])].sort().join(','),
      ].join('|');

      const existing = byKey.get(key);

      if (existing) {
        existing.allowedIn.push(layer.name);
      } else {
        byKey.set(key, {
          package: pkg.package,
          imports: pkg.imports,
          pattern: pkg.pattern,
          exempt: pkg.exempt,
          allowedIn: [layer.name],
        });
      }
    }
  }

  return [...byKey.values()];
}

/** Group layers' global `owns` by name; merge which layers allow each. */
export function deriveGlobalRules(layers: LayerDef[]): GlobalRule[] {
  const byName = new Map<string, GlobalRule>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      if (typeof primitive === 'string' || !('global' in primitive)) continue;

      const existing = byName.get(primitive.global);

      if (existing) {
        existing.allowedIn.push(layer.name);
      } else {
        byName.set(primitive.global, { global: primitive.global, allowedIn: [layer.name] });
      }
    }
  }

  return [...byName.values()];
}

/**
 * Build the structural `no-restricted-imports` group patterns for one layer.
 *
 * Closed-world detection (importing an *undeclared* folder) is intentionally
 * absent: ESLint's `group` negation cannot re-include a path once its parent
 * is excluded, so a `~app/** + !~app/{layer}/**` scheme wrongly flags legal
 * imports. That check is deferred to the Verify runtime (S6 `inspect`).
 */
export function buildStructuralPatterns(params: {
  layer: string;
  aliases: string[];
  forbidden: string[];
  /** The layer's own module layout (drives the same-layer message wording). */
  moduleLayout: 'folder' | 'flat';
  /**
   * Downstream folder-layout layers this layer may import — their module
   * internals are entry-only. Self and forbidden layers are excluded by the
   * caller: both are already banned wholesale, and `no-restricted-imports`
   * reports once per matched group, so overlap would double-report.
   */
  folderTargets?: string[];
  /** Fixture roots barred from production imports (`rules.fixtureImports`). */
  fixtures?: string[];
}): GroupPattern[] {
  const { layer, aliases, forbidden, moduleLayout, folderTargets, fixtures } = params;

  // Escaping the module via `../` cannot be expressed as a literal pattern
  // (it depends on the importing file's depth) — that ban lives in the
  // embedded `blueprint/relative-escape` rule, sharing inspect's resolution.
  const patterns: GroupPattern[] = [
    {
      group: ['./../**', '././**'],
      message:
        '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
    },
    ...aliases.map((a) => ({
      group: [`${a}/${layer}/**`],
      message:
        moduleLayout === 'flat'
          ? `\n🚫 Same-layer imports must be relative. Replace "${a}/${layer}/X" with "./X".`
          : '\n🚫 Do not import from the same layer. Extract shared logic to a lower layer.',
    })),
  ];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => aliases.map((a) => `${a}/${banned}/**`)),
      message:
        '\n🚫 This import violates the dependency flow. Only import from allowed lower layers.',
    });
  }

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message:
        '\n🚫 Production code must not import fixtures — missing data renders empty or error, never fake.',
    });
  }

  // Entry-only: no reaching inside a folder-layout module via the alias.
  // `alias/layer/module` (entry) is allowed; a gitignore `/**` matches only
  // *descendants*, so `alias/L/*/**` bans reaching into a module, not the entry.
  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => aliases.map((a) => `${a}/${target}/*/**`)),
      message:
        '\n🚫 Import a module through its entry, not its internals (e.g. "~app/hooks/useX", not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
}

/** Split disabled package rules into `no-restricted-imports` paths + patterns. */
export function buildPackagePatterns(disabled: PackageRule[]): {
  paths: PathPattern[];
  patterns: GroupPattern[];
} {
  const message = (pkg: PackageRule) =>
    pkg.imports?.length
      ? `\n🚫 Do not import ${pkg.imports.join(', ')} from "${pkg.package}" in this layer.`
      : `\n🚫 Do not import "${pkg.package}" in this layer.`;

  return {
    paths: disabled
      .filter((rule) => !rule.pattern)
      .map((rule) => ({ name: rule.package, importNames: rule.imports, message: message(rule) })),
    patterns: disabled
      .filter((rule) => rule.pattern)
      .map((rule) => ({
        group: [rule.package],
        importNames: rule.imports,
        message: message(rule),
      })),
  };
}

/** Build the `no-restricted-syntax` selector banning re-export of a selfOnly target. */
export function selfOnlyReexportSelector(alias: string, target: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
  const attr = `[source.value=/^${esc(alias)}\\/${esc(target)}\\//]`;

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}
