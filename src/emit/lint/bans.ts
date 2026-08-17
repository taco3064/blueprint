import {
  activeSetting,
  aliasLayerRoots,
  getForbiddenLayers,
  getForbiddenModules,
  getFolderShape,
  getModules,
  getModuleSelfOnlyTargets,
  getSelfOnlyTargets,
} from '../../config';
import type { ArchitectureDef, Blueprint, ModuleDef } from '../../config';
import type { NetScope } from './nets';
import {
  buildModulePatterns,
  buildModuleSelfBan,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
} from './patterns';
import type { GlobalRule, GroupPattern, PackageRule, PathPattern } from './types';

/**
 * What each governed group of the emitted config forbids.
 *
 * The sibling of `nets.ts`, resolved once for the whole blueprint so every net
 * reads the same facts — the flow bans, the ownership bans, and the module-axis
 * self-ban all compile from one pass over `architecture`.
 */

type FolderLayout = 'folder' | 'flat';

/** The parameters `buildStructuralPatterns` cuts one group's layer bans from. */
type StructuralScope = Parameters<typeof buildStructuralPatterns>[0];

/** Everything a net's bans compile from, resolved once for the whole config. */
export interface BanScope {
  architecture: ArchitectureDef;
  aliases: string[];
  /** Each declared layer's folder layout, keyed by layer name. */
  layouts: Record<string, FolderLayout>;
  /** Layers whose feature folders are entry-only. */
  folderLayers: string[];
  /** Declared feature modules — empty under the flat structure. */
  modules: ModuleDef[];
  /** Fixture roots barred from production imports (`rules.fixtureImports`). */
  fixtures: string[];
  packageRules: PackageRule[];
  globalRules: GlobalRule[];
}

/** Resolve the whole blueprint's ban facts once, for every net to read. */
export function resolveBanScope(blueprint: Blueprint): BanScope {
  const { architecture } = blueprint;
  const modules = getModules(architecture);

  // A module owns primitives the same way a layer does, so both go through the
  // one derivation — a net is barred unless its layer or its module owns it.
  const owners = [...architecture.layers, ...modules];
  const moduleNames = modules.map((module) => module.name);

  // Each alias's layer base carries the offset from its target to the
  // source root — `'~root': '.'` bans `~root/src/views/**`, not the
  // `~root/views/**` no import ever uses (field issue #29).
  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const layouts = Object.fromEntries(
    architecture.layers.map((layer) => [
      layer.name,
      getFolderShape(architecture, layer.name).layout,
    ]),
  ) as Record<string, FolderLayout>;

  return {
    architecture,
    aliases,
    layouts,
    folderLayers: architecture.layers
      .map((layer) => layer.name)
      .filter((name) => layouts[name] === 'folder'),
    modules,
    // Fixture roots are barred through the same structural rule per net —
    // a separate entry would *replace* `no-restricted-imports`, not merge it.
    fixtures: activeSetting(blueprint.rules?.fixtureImports)
      ? aliases.flatMap((alias) => [`${alias}/fixtures`, `${alias}/fixtures/**`])
      : [],
    packageRules: derivePackageRules(owners, moduleNames),
    globalRules: deriveGlobalRules(owners, moduleNames),
  };
}

/** The layer-flow facts one net's structural bans are cut from. */
function netLayerScope(net: NetScope, scope: BanScope): StructuralScope {
  return net.module === null
    ? flatLayerScope(net.layer as string, scope)
    : moduleLayerScope(net, scope);
}

/** Layer flow for the net, plus module flow and the self-ban when it sits in a module. */
export function netPatterns(net: NetScope, scope: BanScope): GroupPattern[] {
  const structural = buildStructuralPatterns(netLayerScope(net, scope));

  if (net.module === null) {
    return structural;
  }

  const self = netSelfBan(net, scope);

  return [...structural, ...netModulePatterns(net.module, scope), ...self.patterns];
}

/** The module-flow bans, identical for every net inside the same module. */
function netModulePatterns(module: string, scope: BanScope): GroupPattern[] {
  const { architecture, aliases } = scope;

  return buildModulePatterns({
    module,
    aliases,
    forbidden: getForbiddenModules(architecture, module),
    allowed: allowedModules(architecture, module),
  });
}

/**
 * Modules `moduleName` may import by the default order rule: every declared
 * module that is not forbidden. The complement of `getForbiddenModules`,
 * computed here rather than exported from `config` because only the emitted
 * ban needs the positive list — every other reader asks the negative one.
 */
function allowedModules(architecture: ArchitectureDef, moduleName: string): string[] {
  const forbidden = new Set(getForbiddenModules(architecture, moduleName));

  return getModules(architecture)
    .map((module) => module.name)
    .filter((name) => name !== moduleName && !forbidden.has(name));
}

/** The same-module self-ban for one net inside a module — see `buildModuleSelfBan`. */
function netSelfBan(
  net: NetScope,
  scope: BanScope,
): { paths: PathPattern[]; patterns: GroupPattern[] } {
  if (net.module === null) {
    return { paths: [], patterns: [] };
  }

  const def = scope.modules.find((entry) => entry.name === net.module);
  const layers = def?.layers === false ? [] : scope.architecture.layers.map((layer) => layer.name);

  return buildModuleSelfBan({ module: net.module, aliases: scope.aliases, layers });
}

/** The bare `paths` half of a net's self-ban — merged into the net's package paths. */
export function netSelfBanPaths(net: NetScope, scope: BanScope): PathPattern[] {
  return netSelfBan(net, scope).paths;
}

/**
 * The layer-scoped selfOnly re-export bans a net carries: a layer this net's
 * own layer may depend on but not re-export. Inside a module a target is one
 * depth down, so a ban written at the bare layer name addresses nothing — the
 * re-export selector always reaches one segment deeper than its own name
 * ({@link selfOnlyReexportSelector}), which a bare layer name is never legally
 * imported at (there is no single entry file it resolves to).
 */
export function netSelfOnly(
  net: NetScope,
  architecture: ArchitectureDef,
): { target: string; path: string }[] {
  if (net.layer === null) {
    return [];
  }

  return getSelfOnlyTargets(architecture, net.layer).map((target) => ({
    target,
    path: net.module === null ? target : `${net.module}/${target}`,
  }));
}

/**
 * The module-scoped selfOnly re-export bans a net carries: a module this net's
 * own module may depend on but not re-export. Reached at its own bare entry,
 * so the target carries no prefix — but that also means the re-export selector
 * needs its module-axis twin ({@link selfOnlyModuleReexportSelector}), which
 * matches the bare spelling too, not only one segment deeper.
 */
export function netModuleSelfOnly(
  net: NetScope,
  architecture: ArchitectureDef,
): { target: string; path: string }[] {
  if (net.module === null) {
    return [];
  }

  return getModuleSelfOnlyTargets(architecture, net.module)
    .map((target) => ({ target, path: target }));
}

/**
 * Whether a net is barred from an owned primitive — its layer or its module
 * has to be among the owners.
 */
export function barredIn(net: NetScope, rule: { allowedIn: string[] }): boolean {
  return ![net.layer, net.module].some(
    (owner) => owner !== null && rule.allowedIn.includes(owner),
  );
}

/** The flat structure's layer bans, alias-spelled exactly as the layer is declared. */
function flatLayerScope(layer: string, scope: BanScope): StructuralScope {
  const { architecture, aliases, layouts, folderLayers, fixtures } = scope;
  const forbidden = getForbiddenLayers(architecture, layer);

  return {
    layer,
    aliases,
    forbidden,
    folderLayout: layouts[layer],
    folderTargets: folderLayers.filter((name) => name !== layer && !forbidden.includes(name)),
    fixtures,
  };
}

/**
 * The same layer bans one depth down: every alias-spelled name carries the module
 * in front of it, because that is where the folder actually is. A net with no
 * layer — the module's own root files, or a module holding its files directly —
 * keeps only the generic bans (redundant segments, fixtures) plus the entry-only
 * ban for this module's OWN declared layers, when it has any: the same
 * folder-target protection an inner layer gets, one level up.
 */
function moduleLayerScope(net: NetScope, scope: BanScope): StructuralScope {
  const { architecture, aliases, layouts, folderLayers, fixtures, modules } = scope;
  const module = net.module as string;
  const inside = (name: string): string => `${module}/${name}`;
  const def = modules.find((entry) => entry.name === module);

  if (net.layer === null) {
    return {
      aliases,
      forbidden: [],
      folderTargets: def?.layers === false ? [] : folderLayers.map(inside),
      fixtures,
    };
  }

  const forbidden = getForbiddenLayers(architecture, net.layer);

  return {
    layer: inside(net.layer),
    aliases,
    forbidden: forbidden.map(inside),
    folderLayout: layouts[net.layer],
    folderTargets: folderLayers
      .filter((name) => name !== net.layer && !forbidden.includes(name))
      .map(inside),
    fixtures,
  };
}
