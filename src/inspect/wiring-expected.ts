import { activeSetting, aliasSpecifier, resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import {
  buildStructuralPatterns,
  deriveGlobalRules,
  selfOnlyReexportSelector,
} from '../emit/lint/patterns';
import { buildContainerPatterns } from '../emit/lint/structural';

export type StructuralExpectation = {
  groups: Set<string>;
  selectors: Set<string>;
  globals: Set<string>;
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

  const structural = buildStructuralPatterns({
    layer,
    module,
    aliases,
    forbidden,
    unitLayout: layouts[layer],
    folderTargets: resolved.layers
      .map((entry) => entry.name)
      .filter((name) => layouts[name] === 'folder' && name !== layer && !forbidden.includes(name)),
    fixtures: fixturePatterns(blueprint),
  });

  return {
    groups: new Set(structural.map((pattern) => JSON.stringify(pattern.group))),
    selectors: new Set(
      resolved.selfOnlyTargets(layer).flatMap((target) =>
        aliases.flatMap((alias) => {
          const specifier = aliasSpecifier(alias, module ? `${module}/${target}` : target);

          return specifier === null ? [] : selfOnlyReexportSelector(specifier);
        }),
      ),
    ),
    globals: new Set(
      deriveGlobalRules(resolved.layers.map((entry) => entry.definition))
        .filter((rule) => !rule.allowedIn.includes(layer))
        .map((rule) => rule.global),
    ),
  };
}

export function expectedContainerStructural(
  blueprint: Blueprint,
  module: string,
): StructuralExpectation {
  const resolved = resolveArchitecture(blueprint.architecture);

  const layouts = Object.fromEntries(
    resolved.layers.map((layer) => [layer.name, layer.unit.layout]),
  );

  const patterns = buildContainerPatterns({
    module,
    aliases: resolved.aliases,
    folderTargets: resolved.layerNames.filter((layer) => layouts[layer] === 'folder'),
    fixtures: fixturePatterns(blueprint),
  });

  return {
    groups: new Set(patterns.map((pattern) => JSON.stringify(pattern.group))),
    selectors: new Set(),
    globals: new Set(
      deriveGlobalRules(resolved.layers.map((layer) => layer.definition))
        .map((rule) => rule.global),
    ),
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
