import type { Framework, LayerDef, OwnedPackage } from '../../config/types';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/g;

const DEFAULT_GLOBS: Record<Framework, string> = {
  vue: 'src/{layer}/**/*.{js,ts,vue}',
  react: 'src/{layer}/**/*.{js,jsx,ts,tsx}',
  auto: 'src/{layer}/**/*.{js,jsx,ts,tsx,vue}',
};

/** Coerce a `string | string[]` option to an array. */
export function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/** Resolve a layer's lint file globs, defaulting from `framework`. */
export function resolveLayerFiles(
  layer: string,
  layerFiles: string | string[] | undefined,
  framework: Framework,
): string[] {
  const globs = layerFiles === undefined ? [DEFAULT_GLOBS[framework]] : toArray(layerFiles);

  return globs.map((glob) => glob.replace(LAYER_PLACEHOLDER, layer));
}

/** Group layers' package `owns` by signature; merge which layers allow each. */
export function derivePackageRules(layers: LayerDef[]): PackageRule[] {
  const byKey = new Map<string, PackageRule>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      if (typeof primitive !== 'string' && 'global' in primitive) continue;

      const pkg: OwnedPackage =
        typeof primitive === 'string' ? { package: primitive } : primitive;

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
  moduleLayout: 'folder' | 'flat';
}): GroupPattern[] {
  const { layer, aliases, forbidden, moduleLayout } = params;

  const patterns: GroupPattern[] = [
    {
      group: ['./../**', '././**'],
      message:
        '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
    },
    {
      group: [moduleLayout === 'folder' ? '../*/**' : '../**'],
      message:
        '\n🚫 Do not import from an upper-level directory. Use the project alias to follow the dependency flow.',
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

  // Entry-only: no reaching inside another module via the alias (folder layout).
  // `alias/layer/module` (entry) is allowed; a gitignore `/**` matches only
  // *descendants*, so `alias/*/*/**` bans reaching into a module, not the entry.
  if (moduleLayout === 'folder') {
    patterns.push({
      group: aliases.map((a) => `${a}/*/*/**`),
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
      .map((rule) => ({ group: [rule.package], importNames: rule.imports, message: message(rule) })),
  };
}

/** Build the `no-restricted-syntax` selector banning re-export of a selfOnly target. */
export function selfOnlyReexportSelector(alias: string, target: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
  const attr = `[source.value=/^${esc(alias)}\\/${esc(target)}\\//]`;

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}
