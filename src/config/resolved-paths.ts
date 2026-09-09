import type { Framework } from './types';
import { aliasPathSpecifier } from './graph';
import type { AliasRoot } from './graph';
import type {
  ResolveArchitectureContext,
  ResolvedArchitecture,
  ResolvedPosition,
  ResolverState,
} from './resolved';

interface PathContext {
  state: ResolverState;
  resolved: ResolvedArchitecture;
  relativeParts: (file: string | string[]) => string[];
  classify: ResolvedArchitecture['classify'];
}

export function createPathMethods(context: PathContext): Pick<ResolvedArchitecture,
  | 'resolveModuleRoot'
  | 'resolveLayerRoot'
  | 'resolveModuleLayerRoot'
  | 'layerFiles'
  | 'moduleLayerFiles'
  | 'resolveImportPosition'
  | 'resolveImportTarget'
  | 'forbiddenLayers'
  | 'selfOnlyTargets'
  | 'aliasSpecifiers'> {
  const { state, resolved, relativeParts, classify } = context;

  return {
    resolveModuleRoot: (module) => state.moduleByName.get(module)?.root ?? null,
    resolveLayerRoot: (layer) => state.moduleFirst
      ? null
      : state.layerByName.get(layer)?.root ?? null,
    resolveModuleLayerRoot: (module, layer) => moduleLayerRoot(state, module, layer),
    layerFiles: (layer, framework) => layerFiles({ state, resolved }, layer, framework),
    moduleLayerFiles: (module, layer, framework) =>
      moduleLayerFiles(state, { module, layer, framework }),
    resolveImportPosition: (importer, specifier, router) => importPosition(
      { state, relativeParts, classify }, { importer, specifier, router },
    ),
    resolveImportTarget(importer, specifier) {
      return resolved.resolveImportPosition(importer, specifier)?.layer ?? null;
    },
    forbiddenLayers: (layer) => state.layers
      .filter((target) => target.name !== layer && !resolved.canImport(layer, target.name))
      .map((target) => target.name),
    selfOnlyTargets: (layer) => state.layers
      .filter((target) => target.allowedImporters.some((importer) =>
        importer.layer === layer && importer.selfOnly))
      .map((target) => target.name),
    aliasSpecifiers: (layer, module) => aliasSpecifiers(state, layer, module),
  };
}

function moduleLayerRoot(state: ResolverState, module: string, layer: string): string | null {
  if (!state.moduleFirst || !state.moduleByName.has(module) || !state.layerByName.has(layer)) {
    return null;
  }

  return joinSource(state.sourceRoot, module, layer);
}

function layerFiles(
  context: { state: ResolverState; resolved: ResolvedArchitecture },
  layer: string,
  framework: Framework,
): string[] {
  const { state, resolved } = context;

  if (!state.moduleFirst) {
    return resolveLayerFilePatterns(layer, framework, {
      layerFiles: state.definition.layerFiles,
      layerRoot: state.layerByName.get(layer)?.root ?? joinSource(state.sourceRoot, layer),
      sourceRoot: state.sourceRoot,
    });
  }

  return state.modules.flatMap((module) => resolved.moduleLayerFiles(module.name, layer, framework));
}

function moduleLayerFiles(
  state: ResolverState,
  input: { module: string; layer: string; framework: Framework },
): string[] {
  const root = moduleLayerRoot(state, input.module, input.layer);

  if (root === null) {
    return [];
  }

  return resolveLayerFilePatterns(input.layer, input.framework, {
    layerFiles: state.definition.layerFiles,
    layerRoot: root,
    sourceRoot: state.sourceRoot,
    module: input.module,
  });
}

function importPosition(
  context: {
    state: ResolverState;
    relativeParts: (file: string | string[]) => string[];
    classify: ResolvedArchitecture['classify'];
  },
  input: {
    importer: string | string[];
    specifier: string;
    router?: ResolveArchitectureContext;
  },
): ResolvedPosition | null {
  const { state, relativeParts, classify } = context;
  const aliasTarget = resolveAliasPath(state.aliases, input.specifier);

  if (aliasTarget !== undefined) {
    return aliasTarget === null ? null : classify(aliasTarget, input.router);
  }

  if (!input.specifier.startsWith('.')) {
    return null;
  }

  const importerParts = relativeParts(input.importer);
  const target = resolveRelative(importerParts.slice(0, -1), input.specifier);

  return target ? classify(target, input.router) : null;
}

function aliasSpecifiers(state: ResolverState, layer: string, module?: string): string[] {
  if (state.moduleFirst && module === undefined) {
    return state.modules.flatMap((candidate) => state.aliases.flatMap((root) =>
      aliasPathSpecifier(root, [candidate.name, layer]) ?? []));
  }

  const target = module === undefined ? [layer] : [module, layer];

  return state.aliases.flatMap((root) => aliasPathSpecifier(root, target) ?? []);
}

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue', react: 'js,jsx,ts,tsx', auto: 'js,jsx,ts,tsx,vue',
};

export function resolveLayerFilePatterns(
  layer: string,
  framework: Framework,
  scope: {
    layerFiles?: string | string[];
    layerRoot?: string;
    sourceRoot?: string;
    module?: string;
  } = {},
): string[] {
  const sourceRoot = scope.sourceRoot ?? 'src';
  const defaultRoot = scope.layerRoot ?? joinSource(sourceRoot, '{layer}');

  const declared = scope.layerFiles === undefined
    ? [`${defaultRoot}/**/*.{${FRAMEWORK_EXTS[framework]}}`]
    : toArray(scope.layerFiles);

  return declared.map((glob) => glob
    .replace(/\{\s*module\s*\}/g, () => scope.module ?? '{module}')
    .replace(/\{\s*layer\s*\}/g, () => layer));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function resolveAliasPath(aliases: AliasRoot[], specifier: string): string[] | null | undefined {
  const root = aliases.find((candidate) =>
    specifier === candidate.alias || specifier.startsWith(`${candidate.alias}/`));

  if (!root) {
    return undefined;
  }

  const parts = specifier.slice(root.alias.length).split('/').filter(Boolean);

  if (!startsWith(parts, root.prefix)) {
    return null;
  }

  return [...(root.prepend ?? []), ...parts.slice(root.prefix.length)];
}

function resolveRelative(from: string[], specifier: string): string[] | null {
  const result = [...from];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      if (result.pop() === undefined) {
        return null;
      }
    } else {
      result.push(part);
    }
  }

  return result;
}

function joinSource(sourceRoot: string, ...parts: string[]): string {
  return [sourceRoot === '.' ? '' : sourceRoot, ...parts].filter(Boolean).join('/');
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
}
