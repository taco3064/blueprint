import { dirSegments } from '../../config';
import type { Framework, LayerDef, ModuleDef, OwnedPackage } from '../../config';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/g;
// The descent a layer glob makes past its own folder: the placeholder, then a
// globstar segment. Collapsing it is how a module's own root files are derived
// from the same template its layers are.
const LAYER_DESCENT = /\{\s*layer\s*\}\/\*\*\//g;

/**
 * Source extensions per framework — the layer-glob default, and the ext set
 * the generated config's guard block scopes to (a react repo's guard used
 * to carry `.vue`, and four field agents hand-trimmed it — issue #30).
 */
export const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

/**
 * The default `{layer}` glob for a framework under a given source root.
 *
 * Normalized through the same `dirSegments` `relative-escape.ts` reads
 * `sourceRoot` through — a raw `${sourceRoot}/` concatenation let a
 * normalized-but-not-bare-`'.'` form (`'./lib/app/'`, `'./'`) through as a
 * double-slash glob (`lib/app//components/**`), the exact shape `dirSegments`
 * exists to collapse. Joining the segments back with `/` is what keeps this
 * site and the rule it feeds reading `sourceRoot` the same way.
 */
function defaultGlob(framework: Framework, sourceRoot: string): string {
  const segments = dirSegments(sourceRoot);
  const prefix = segments.length ? `${segments.join('/')}/` : '';

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

/**
 * Coerce a `string | string[]` option to an array — and an absent one to none.
 *
 * The `undefined` arm lives here rather than as a `?? []` at each call site. Written
 * there, it decided nothing measurable: the sentinel a mutation puts in its place
 * becomes one more glob, and a glob that matches nothing is indistinguishable from
 * no glob at all. Asked of this function directly, "nothing configured is no globs"
 * has one answer.
 */
export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/** Where a layer's files are looked for, before the placeholder is filled in. */
export interface FileScope {
  layerFiles?: string | string[];
  sourceRoot?: string;
}

/** The `{layer}` glob templates in force — the explicit ones, or the framework default. */
function layerGlobs(framework: Framework, scope: FileScope): string[] {
  const { layerFiles, sourceRoot = 'src' } = scope;

  return layerFiles === undefined ? [defaultGlob(framework, sourceRoot)] : toArray(layerFiles);
}

/**
 * Resolve a layer's lint file globs. An explicit `layerFiles` wins as-is;
 * otherwise the default is derived from `framework` and `sourceRoot`.
 *
 * Under a modular structure the caller passes `<module>/<layer>`: the module
 * prefix rides the same placeholder the source root already sits in front of,
 * so a configured `layerFiles` takes it without a second substitution rule.
 */
export function resolveLayerFiles(
  layer: string,
  framework: Framework,
  scope: FileScope = {},
): string[] {
  return layerGlobs(framework, scope).map((glob) => glob.replace(LAYER_PLACEHOLDER, layer));
}

/**
 * A module's own root files — its public entry and whatever sits beside it,
 * one level deep. Derived from the same templates the layer nets use, so a
 * configured `layerFiles` keeps its extensions here: what collapses is the
 * descent into the layer folder, not the glob.
 */
export function resolveModuleRootFiles(
  module: string,
  framework: Framework,
  scope: FileScope = {},
): string[] {
  return layerGlobs(framework, scope).map((glob) =>
    glob.replace(LAYER_DESCENT, `${module}/`).replace(LAYER_PLACEHOLDER, module),
  );
}

/**
 * Anything that can own primitives exclusively: a layer, or a feature module.
 * The two are the same declaration one depth apart, and a file group inside a
 * module may reach a primitive its layer owns OR its module owns.
 */
export type PrimitiveOwner = LayerDef | ModuleDef;

/**
 * Who a restriction's owners are, in the words the ban has to say.
 *
 * A layer-only restriction answers exactly what it always did, because that is
 * the only case a flat blueprint can produce and its wording must not move. A
 * module owner is named outright — "its owning layer" sends the reader to a
 * block of the config where the declaration is not.
 */
export function ownerPhrase(rule: { allowedIn: string[]; modules?: string[] }): string {
  const modules = rule.modules ?? [];

  if (!modules.length) {
    return 'its owning layer';
  }

  const named = modules.map((name) => `"${name}"`).join(', ');
  const phrase = modules.length === 1 ? `module ${named}` : `modules ${named}`;

  return rule.allowedIn.length > modules.length ? `${phrase} and its owning layer` : phrase;
}

/** Mark the owners that are modules, leaving a layer-only rule untouched. */
function tagModules<T extends { allowedIn: string[] }>(rules: T[], modules: string[]): T[] {
  return rules.map((rule) => {
    const owned = rule.allowedIn.filter((name) => modules.includes(name));

    // Spread only when there is something to say, so a flat blueprint's rules are
    // the same objects they were — no key to leak into a message or a comparison.
    return owned.length ? { ...rule, modules: owned } : rule;
  });
}

/**
 * Group owners' package `owns` by signature; merge which owners allow each.
 * `moduleNames` tags which of `owners` are modules rather than layers — omit
 * it for the flat structure, where every owner is a layer.
 */
export function derivePackageRules(
  owners: PrimitiveOwner[],
  moduleNames: string[] = [],
): PackageRule[] {
  const byKey = new Map<string, PackageRule>();

  for (const owner of owners) {
    for (const primitive of owner.owns ?? []) {
      if (typeof primitive !== 'string' && 'global' in primitive) {
        continue;
      }

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
        existing.allowedIn.push(owner.name);
      } else {
        byKey.set(key, {
          package: pkg.package,
          imports: pkg.imports,
          pattern: pkg.pattern,
          exempt: pkg.exempt,
          allowedIn: [owner.name],
        });
      }
    }
  }

  return tagModules([...byKey.values()], moduleNames);
}

/**
 * Group owners' global `owns` by name; merge which owners allow each.
 * `moduleNames` tags which of `owners` are modules rather than layers — omit
 * it for the flat structure, where every owner is a layer.
 */
export function deriveGlobalRules(
  owners: PrimitiveOwner[],
  moduleNames: string[] = [],
): GlobalRule[] {
  const byName = new Map<string, GlobalRule>();

  for (const owner of owners) {
    if (!owner.owns) {
      continue;
    }

    for (const primitive of owner.owns) {
      if (typeof primitive === 'string' || !('global' in primitive)) {
        continue;
      }

      const existing = byName.get(primitive.global);

      if (existing) {
        existing.allowedIn.push(owner.name);
      } else {
        byName.set(primitive.global, { global: primitive.global, allowedIn: [owner.name] });
      }
    }
  }

  return tagModules([...byName.values()], moduleNames);
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
  /**
   * The layer these files are in, alias-spelled — `components`, or
   * `Combat/components` inside a feature module. Absent for a group that
   * belongs to no layer (a module's own root files), which has no same-layer
   * edge to ban.
   */
  layer?: string;
  aliases: string[];
  forbidden: string[];
  /** The layer's own folder layout (drives the same-layer message wording). */
  folderLayout?: 'folder' | 'flat';
  /**
   * Downstream folder-layout layers this layer may import, entry-only. Self and
   * forbidden layers are excluded by the caller — already banned wholesale, and
   * `no-restricted-imports` reports once per group, so overlap double-reports.
   */
  folderTargets?: string[];
  /** Fixture roots barred from production imports (`rules.fixtureImports`). */
  fixtures?: string[];
}): GroupPattern[] {
  const { layer, aliases, forbidden, folderLayout, folderTargets, fixtures } = params;

  // Escaping the folder via `../` cannot be expressed as a literal pattern
  // (it depends on the importing file's depth) — that ban lives in the
  // embedded `blueprint/relative-escape` rule, sharing inspect's resolution.
  const sameLayer = layer === undefined
    ? []
    : aliases.map((a) => ({
        group: [`${a}/${layer}/**`],
        message:
          folderLayout === 'flat'
            ? `\n🚫 Same-layer imports must be relative. Replace "${a}/${layer}/X" with "./X".`
            // The sibling is reachable, just not by this spelling: one shape for
            // same-layer edges keeps the cycle surface to relative paths alone.
            : `\n🚫 Same-layer imports must be relative. Replace "${a}/${layer}/X" with "../X" `
              + '— its entry only; what is behind the entry stays private.',
      }));

  const patterns: GroupPattern[] = [
    {
      group: ['./../**', '././**'],
      message:
        '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
    },
    ...sameLayer,
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
        '\n🚫 Production code must not import fixtures — missing data renders empty or error, '
        + 'never fake.',
    });
  }

  // Entry-only: no reaching inside a folder-layout feature folder via the alias.
  // `alias/layer/folder` (entry) is allowed; a gitignore `/**` matches only
  // *descendants*, so `alias/L/*/**` bans reaching into a folder, not the entry.
  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => aliases.map((a) => `${a}/${target}/*/**`)),
      message:
        '\n🚫 Import a folder through its entry, not its internals (e.g. "~app/hooks/useX", '
        + 'not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
}

/**
 * The module-flow `no-restricted-imports` group patterns for one feature module,
 * from OUTSIDE it — the module-axis twin of the `forbidden` / `folderTargets`
 * halves of {@link buildStructuralPatterns}.
 *
 * Two bans of opposite shape. A module this one may not import is barred at both
 * spellings — the bare alias path IS the entry, so banning only `alias/N/**`
 * would leave the front door open. A module it MAY import is barred at
 * `alias/N/**` alone, and that is the same gitignore semantics the folder-target
 * ban above relies on: `/**` matches descendants only, so the entry survives and
 * everything behind it does not.
 */
export function buildModulePatterns(params: {
  module: string;
  aliases: string[];
  /** Modules this one may not import at all. */
  forbidden: string[];
  /** Modules this one may import — at their entry, and no deeper. */
  allowed: string[];
}): GroupPattern[] {
  const { module, aliases, forbidden, allowed } = params;
  const patterns: GroupPattern[] = [];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((name) => aliases.flatMap((a) => [`${a}/${name}`, `${a}/${name}/**`])),
      message:
        `\n🚫 "${module}" may not import this module — a module may import only a module `
        + 'declared after it, and only if that module\'s own allowedImporters does not narrow '
        + 'it out. Reorder the declaration, or move the shared code into a module both may reach.',
    });
  }

  if (allowed.length) {
    patterns.push({
      group: allowed.flatMap((name) => aliases.map((a) => `${a}/${name}/**`)),
      message:
        '\n🚫 Import a module through its entry, not its internals — the alias spelling of the '
        + 'module name IS the entry, and what is behind it is that module\'s own business.',
    });
  }

  return patterns;
}

/**
 * The same-module self-ban for one governed group inside a feature module: an
 * alias import of the module's OWN files must be relative instead, the module-axis
 * twin of a flat layer's own `sameLayer` ban.
 *
 * Two enumerated shapes, not one wildcard — `no-restricted-imports` groups cannot
 * re-include a path once a broader glob has already excluded it (the same
 * closed-world constraint {@link buildStructuralPatterns} documents), so a `**`
 * ban can never carve a declared layer back out. The bare alias spelling of the
 * module IS its entry, banned as an exact `paths` entry rather than a `group` glob:
 * a bare gitignore-style pattern with no wildcard matches its own name AND every
 * descendant, which is exactly the blanket a layered module must not get. One
 * level deeper, this module's declared layer names are excluded from a
 * single-level `*` by exact literal negation — which works, unlike negating a
 * path a wildcard already matched. Everything past that one level (a declared
 * layer's own internals) is somebody else's ban: the ordinary intra-module layer
 * permission model, one segment in.
 */
export function buildModuleSelfBan(params: {
  module: string;
  aliases: string[];
  /**
   * This module's own declared layer names, excluded from the root-file ban —
   * reaching one via the alias one level in is the legal cross-layer route
   * (`~app/N/hooks`, the modular restatement of the flat model's own
   * cross-layer `~app/hooks`). Empty for a `layers: false` module: there is no
   * declared layer to wrongly catch, so the ban covers the whole subtree.
   */
  layers: string[];
}): { paths: PathPattern[]; patterns: GroupPattern[] } {
  const { module, aliases, layers } = params;

  const message = (path: string) =>
    `\n🚫 Same-module imports must be relative. Replace "${path}/X" with "./X" — the alias is `
    + 'how a module is reached from outside it.';

  return {
    paths: aliases.map((a) => ({ name: `${a}/${module}`, message: message(`${a}/${module}`) })),
    patterns: aliases.map((a) => ({
      group: layers.length
        ? [`${a}/${module}/*`, ...layers.map((name) => `!${a}/${module}/${name}`)]
        : [`${a}/${module}/**`],
      message: message(`${a}/${module}`),
    })),
  };
}

/** Split disabled package rules into `no-restricted-imports` paths + patterns. */
export function buildPackagePatterns(disabled: PackageRule[]): {
  paths: PathPattern[];
  patterns: GroupPattern[];
} {
  // "in this layer" is the whole answer while a layer is the only thing that can
  // own a package. Once a module can, the ban has to say which one does — the
  // reader's next move is to open that declaration, and they need its address.
  const where = (pkg: PackageRule) =>
    pkg.modules?.length ? `here — it is owned by ${ownerPhrase(pkg)}` : 'in this layer';

  const message = (pkg: PackageRule) =>
    pkg.imports?.length
      ? `\n🚫 Do not import ${pkg.imports.join(', ')} from "${pkg.package}" ${where(pkg)}.`
      : `\n🚫 Do not import "${pkg.package}" ${where(pkg)}.`;

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

/**
 * One `source.value` regex attribute for a selfOnly re-export selector, anchored
 * on `alias/target` with `suffix` deciding how deep it must reach. `/` is
 * encoded as the `\u002F` regex escape: esquery's regex literal ends at the
 * first raw `/`, and versions below 1.7 reject the `\/` escape too —
 * truncating the pattern and crashing ESLint on every file of the layer
 * (field issue #19) — while `\u002F` parses on every version and still
 * means `/` to the RegExp.
 */
function reexportAttr(alias: string, target: string, suffix: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\u002F');

  return `[source.value=/^${esc(alias)}\\u002F${esc(target)}${suffix}/]`;
}

/**
 * Build the `no-restricted-syntax` selector banning re-export of a selfOnly
 * layer target — always reached one segment deeper than its own name (a
 * layer has no single entry file the bare alias path resolves to; the
 * caller always names something inside it, e.g. `~app/services/api`).
 */
export function selfOnlyReexportSelector(alias: string, target: string): string {
  const attr = reexportAttr(alias, target, '\\u002F');

  return `ExportNamedDeclaration${attr}, ExportAllDeclaration${attr}`;
}

/**
 * The module-axis twin of {@link selfOnlyReexportSelector}. A module's public
 * face IS the bare alias path (`~app/Lobby` resolves to its entry, with
 * nothing after it) — unlike a layer, which has no single entry file the bare
 * alias path resolves to, so re-exporting a module's selfOnly import has to be
 * caught at that exact spelling too, not only one segment deeper.
 */
export function selfOnlyModuleReexportSelector(alias: string, target: string): string {
  const bare = reexportAttr(alias, target, '$');
  const deeper = reexportAttr(alias, target, '\\u002F');

  return `ExportNamedDeclaration${bare}, ExportAllDeclaration${bare}, `
    + `ExportNamedDeclaration${deeper}, ExportAllDeclaration${deeper}`;
}
