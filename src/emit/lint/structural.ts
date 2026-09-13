import { aliasSpecifier } from '../../config';
import type { AliasRoot, ResolvedArchitecture } from '../../config';
import {
  renderEntryOnly,
  renderFixtureImport,
  renderLayerFlowViolation,
  renderModuleContainerImport,
  renderModuleFlowViolation,
  renderRedundantRelativeSegments,
  renderSameLayerImport,
} from '../../operational-contract';
import type { GroupPattern, PathPattern } from './types';

export function normalizeGroupPatterns(patterns: GroupPattern[]): GroupPattern[] {
  const seen = new Set<string>();

  return patterns.flatMap((pattern) => {
    const normalized = {
      ...pattern,
      group: [...new Set(pattern.group.map(escapeLeadingHash))],
    };

    const key = JSON.stringify(normalized);

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [normalized];
  });
}

function escapeLeadingHash(pattern: string): string {
  if (pattern.startsWith('#')) {
    return `\\${pattern}`;
  }

  return pattern.startsWith('!#') ? `!\\${pattern.slice(1)}` : pattern;
}

export function buildStructuralPatterns(params: {
  layer: string;
  module?: string;
  targetModules?: string[];
  forbiddenModules?: string[];
  aliases: (AliasRoot | string)[];
  forbidden: string[];
  unitLayout: 'folder' | 'file';
  folderTargets?: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const {
    layer, module, targetModules, forbiddenModules, aliases, forbidden,
    unitLayout, folderTargets, fixtures,
  } = params;

  const inModule = (target: string) => module ? `${module}/${target}` : target,
    innerTargets = targetModules ?? (module ? [module] : []),
    atPosition = (target: string) => innerTargets.length
      ? innerTargets.map((targetModule) => `${targetModule}/${target}`)
      : [target],
    patterns: GroupPattern[] = [{
      group: ['./../**', '././**'],
      message: renderRedundantRelativeSegments(),
    }, ...aliases.flatMap((alias) => {
      const specifier = aliasSubtreeSpecifier(alias, inModule(layer));

      if (specifier === null) {
        return [];
      }

      return [{
        group: [specifier, `${specifier}/**`],
        message: renderSameLayerImport(specifier, unitLayout),
      }];
    })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => atPosition(banned).flatMap((position) =>
        aliases.flatMap((alias) => {
          const specifier = aliasSubtreeSpecifier(alias, position);

          return specifier === null ? [] : [specifier, `${specifier}/**`];
        }))),
      message: renderLayerFlowViolation(),
    });
  }

  if (forbiddenModules?.length) {
    patterns.push({
      group: forbiddenModules.flatMap((targetModule) => aliases.flatMap((alias) => {
        const specifier = aliasSubtreeSpecifier(alias, targetModule);

        return specifier === null ? [] : [specifier, `${specifier}/**`];
      })),
      message: renderModuleFlowViolation(),
    });
  }

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message: renderFixtureImport(),
    });
  }

  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => atPosition(target).flatMap((position) =>
        aliases.flatMap((alias) => folderEntryPatterns(alias, position)))),
      message: renderEntryOnly(true),
    });
  }

  return patterns;
}

export function aliasSubtreeSpecifier(root: AliasRoot | string, target: string): string | null {
  if (
    (
      // Stryker disable next-line ConditionalExpression: strings also have no prepend value.
      typeof root === 'string'
    ) || !root.prepend?.length
  ) {
    return aliasSpecifier(root, target);
  }

  const targetSegments = segments(target);

  return startsWith(root.prepend, targetSegments)
    ? root.alias
    : aliasSpecifier(root, target);
}

function folderEntryPatterns(root: AliasRoot | string, target: string): string[] {
  if (
    (
      // Stryker disable next-line ConditionalExpression: strings also have no prepend value.
      typeof root === 'string'
    ) || !root.prepend?.length
  ) {
    const specifier = aliasSpecifier(root, target)!;

    return [`${specifier}/*/**`];
  }

  const targetSegments = segments(target);

  if (!startsWith(root.prepend, targetSegments)) {
    const specifier = aliasSpecifier(root, target);

    return specifier === null ? [] : [`${specifier}/*/**`];
  }

  const depth = root.prepend.length - targetSegments.length;

  if (depth === 0) {
    return [`${root.alias}/*/**`];
  }

  return depth === 1
    ? [`${root.alias}/*`]
    : [root.alias, `${root.alias}/**`];
}

export function buildModuleContainerPaths(
  aliases: (AliasRoot | string)[],
  modules: string[] | undefined,
): PathPattern[] {
  return (modules ?? []).flatMap((module) => aliases.flatMap((alias) => {
    const name = aliasSpecifier(alias, module);

    return name === null
      ? []
      : [{
          name,
          message: renderModuleContainerImport(),
        }];
  }));
}

export function buildModuleContainerPatterns(
  aliases: (AliasRoot | string)[],
  modules: string[] | undefined,
  layers: string[],
): GroupPattern[] {
  return (modules ?? []).flatMap((module) => aliases.flatMap((alias) => {
    const specifier = aliasSpecifier(alias, module);

    if (specifier === null) {
      return isModuleContainerAlias(alias, module, layers)
        ? [moduleContainerPattern([alias.alias, `${alias.alias}/**`])]
        : [];
    }

    const allowed = layers.flatMap((layer) => {
      const layerSpecifier = aliasSpecifier(alias, `${module}/${layer}`)!;

      return [`!${layerSpecifier}`, `!${layerSpecifier}/**`];
    });

    return [moduleContainerPattern([`${specifier}/*`, ...allowed])];
  }));
}

function isModuleContainerAlias(
  alias: AliasRoot | string,
  module: string,
  layers: string[],
): alias is AliasRoot {
  return (
    // Stryker disable next-line ConditionalExpression: null specifiers come from objects.
    typeof alias !== 'string'
  ) && (
    // Stryker disable next-line OptionalChaining: a null specifier requires a prepend.
    alias.prepend?.length === 2
  )
  && alias.prepend[0] === module
  && !layers.includes(alias.prepend[1])
  && /\.(?:js|jsx|ts|tsx|mjs|cjs|vue)$/.test(alias.prepend[1]);
}

function moduleContainerPattern(group: string[]): GroupPattern {
  return {
    group,
    message: renderModuleContainerImport(),
  };
}

export function buildModuleContainerRestrictions(
  aliases: (AliasRoot | string)[],
  modules: string[] | undefined,
  layers: string[],
): { paths: PathPattern[]; patterns: GroupPattern[] } {
  return {
    paths: buildModuleContainerPaths(aliases, modules),
    patterns: buildModuleContainerPatterns(aliases, modules, layers),
  };
}

export function buildContainerPatterns(params: {
  module: string;
  targetModules?: string[];
  forbiddenModules?: string[];
  aliases: (AliasRoot | string)[];
  folderTargets: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const { module, targetModules = [module], forbiddenModules, aliases, folderTargets, fixtures }
    = params;

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: renderRedundantRelativeSegments(),
  }];

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message: renderFixtureImport(),
    });
  }

  if (folderTargets.length) {
    patterns.push({
      group: targetModules.flatMap((targetModule) => folderTargets.flatMap((target) =>
        aliases.flatMap((alias) => folderEntryPatterns(alias, `${targetModule}/${target}`)))),
      message: renderEntryOnly(false),
    });
  }

  if (forbiddenModules?.length) {
    patterns.push({
      group: forbiddenModules.flatMap((targetModule) => aliases.flatMap((alias) => {
        const specifier = aliasSubtreeSpecifier(alias, targetModule);

        return specifier === null ? [] : [specifier, `${specifier}/**`];
      })),
      message: renderModuleFlowViolation(),
    });
  }

  return patterns;
}

function segments(value: string): string[] {
  return value.split('/').filter(Boolean);
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
}

export function moduleImportScope(
  resolved: ResolvedArchitecture,
  module: string | undefined,
): { targetModules?: string[]; forbiddenModules?: string[] } {
  if (!module) {
    return {};
  }

  const targetModules = [
    module,
    ...resolved.modules.find((entry) => entry.name === module)!.reachable,
  ];

  return {
    targetModules,
    forbiddenModules: resolved.modules
      .map((entry) => entry.name)
      .filter((name) => !targetModules.includes(name)),
  };
}
