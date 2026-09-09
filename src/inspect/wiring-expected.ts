import { activeSetting, resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import {
  buildStructuralPatterns,
  deriveGlobalRules,
  selfOnlyReexportSelector,
} from '../emit/lint/patterns';
import {
  buildContainerPatterns,
  buildModuleContainerPaths,
  buildModuleContainerPatterns,
  moduleImportScope,
  aliasSubtreeSpecifier,
} from '../emit/lint/structural';

export type StructuralExpectation = {
  groups: Set<string>;
  paths: Set<string>;
  selectors: Set<string>;
  globals: Set<string>;
  importBoundary: string;
};

export function expectedStructural(
  blueprint: Blueprint,
  layer: string,
  module?: string,
): StructuralExpectation {
  const { architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const aliases = resolved.aliases;

  const layouts = Object.fromEntries(
    resolved.layers.map((entry) => [entry.name, entry.unit.layout]),
  );

  const forbidden = resolved.forbiddenLayers(layer);
  const { targetModules, forbiddenModules } = moduleImportScope(resolved, module);

  const structural = buildStructuralPatterns({
    layer,
    module,
    targetModules,
    forbiddenModules,
    aliases,
    forbidden,
    unitLayout: layouts[layer],
    folderTargets: resolved.layers
      .map((entry) => entry.name)
      .filter((name) => layouts[name] === 'folder'
        && (name === layer ? module !== undefined : !forbidden.includes(name))),
    fixtures: fixturePatterns(blueprint),
  });

  const containerPatterns = buildModuleContainerPatterns(
    aliases,
    targetModules,
    resolved.layerNames,
  );

  return {
    groups: new Set(
      [...structural, ...containerPatterns].map((pattern) => JSON.stringify(pattern.group)),
    ),
    paths: new Set(buildModuleContainerPaths(aliases, targetModules).map((path) => path.name)),
    selectors: new Set(
      resolved.selfOnlyTargets(layer).flatMap((target) =>
        (targetModules ?? [undefined]).flatMap((targetModule) => aliases.flatMap((alias) => {
          const specifier = aliasSubtreeSpecifier(
            alias,
            targetModule ? `${targetModule}/${target}` : target,
          );

          return specifier === null ? [] : selfOnlyReexportSelector(specifier);
        })),
      ),
    ),
    globals: new Set(
      deriveGlobalRules(resolved.layers.map((entry) => entry.definition))
        .filter((rule) => !rule.allowedIn.includes(layer))
        .map((rule) => rule.global),
    ),
    importBoundary: JSON.stringify(architecture),
  };
}

export function expectedContainerStructural(
  blueprint: Blueprint,
  module: string,
): StructuralExpectation {
  const resolved = resolveArchitecture(blueprint.architecture);
  const { targetModules, forbiddenModules } = moduleImportScope(resolved, module);

  const layouts = Object.fromEntries(
    resolved.layers.map((layer) => [layer.name, layer.unit.layout]),
  );

  const patterns = buildContainerPatterns({
    module,
    targetModules,
    forbiddenModules,
    aliases: resolved.aliases,
    folderTargets: resolved.layerNames.filter((layer) => layouts[layer] === 'folder'),
    fixtures: fixturePatterns(blueprint),
  });

  return {
    groups: new Set(patterns.map((pattern) => JSON.stringify(pattern.group))),
    paths: new Set(),
    selectors: new Set(),
    globals: new Set(
      deriveGlobalRules(resolved.layers.map((layer) => layer.definition))
        .map((rule) => rule.global),
    ),
    importBoundary: JSON.stringify(blueprint.architecture),
  };
}

function fixturePatterns(blueprint: Blueprint): string[] {
  if (!activeSetting(blueprint.rules?.fixtureImports)) {
    return [];
  }

  return resolveArchitecture(blueprint.architecture).aliases.flatMap((root) => {
    const alias = [root.alias, ...root.prefix].join('/');

    return root.prepend?.length ? [] : [`${alias}/fixtures`, `${alias}/fixtures/**`];
  });
}
