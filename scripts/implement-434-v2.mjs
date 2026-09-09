import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function replaceExact(file, from, to) {
  const current = read(file);

  if (!current.includes(from)) {
    throw new Error(`implement-434-v2: expected snippet not found in ${file}`);
  }

  write(file, current.replace(from, to));
}

// ---------------------------------------------------------------------------
// Public config vocabulary: Module -> Layer -> Unit.
// ---------------------------------------------------------------------------
replaceExact(
  'src/config/types.ts',
  `/** Per-layer override of the shared module shape (see {@link ModuleDef}). */\nexport interface LayerModuleDef {\n  /** Override the layout for this layer only. */\n  layout?: 'folder' | 'flat';\n  /** Override the public entry filename for this layer only. */\n  entry?: string;\n}\n\n`,
  '',
);

replaceExact(
  'src/config/types.ts',
  `  /**\n   * Override the shared \`architecture.module\` shape for this layer — e.g.\n   * folder modules in a feature layer while the rest of the project is flat.\n   */\n  module?: LayerModuleDef;\n`,
  `  /** Unit shape inside this layer. Omit for the one-file default. */\n  layout?: 'folder' | 'file';\n  /** Public entry filename for folder units. Omit for \`index\`. */\n  entry?: string;\n`,
);

replaceExact(
  'src/config/types.ts',
  `/** How a single module (feature folder) is shaped. */\nexport interface ModuleDef {\n  /**\n   * \`folder\` = one folder per module with an entry file; \`flat\` = single\n   * file. Optional — omitting it means \`flat\`.\n   */\n  layout?: 'folder' | 'flat';\n  /**\n   * The public entry filename. Everything else is private. Optional —\n   * omitting it means \`index\`.\n   */\n  entry?: string;\n  /**\n   * Private sub-parts kept behind the entry, e.g. \`['hooks', 'styles',\n   * 'types']\`. Optional — omitting it means none (\`[]\`).\n   */\n  private?: string[];\n}\n`,
  `/** One declared module directly below sourceRoot in module-first topology. */\nexport interface ModuleDef {\n  /** One-segment source-root folder name. */\n  name: string;\n  /** One-line responsibility for this module. */\n  does: string;\n}\n`,
);

replaceExact(
  'src/config/types.ts',
  `  /**\n   * Ordered layers. Order defines the one-way flow: a layer may import only\n   * layers declared after it. Per-layer \`allowedImporters\` narrows who may\n   * import a given layer (see {@link LayerDef.allowedImporters}).\n   */\n  layers: LayerDef[];\n  /** Dependency direction. Only \`one-way\` for now (upstream imports banned). */\n  /**\n   * Feature-folder shape shared across layers. Optional — omitting it (or\n   * any of its keys) means the flat default, \`{ layout: 'flat', entry:\n   * 'index' }\`; declare it to switch to folder layout or rename the entry.\n   */\n  module?: ModuleDef;\n  /**\n   * Layer → file glob(s), each carrying a \`{layer}\` placeholder. Defaults are\n   * derived from \`framework\` when omitted.\n   */\n`,
  `  /**\n   * Optional pure module-first topology. Each name maps to a direct child of\n   * sourceRoot. Omit this field to preserve layer-first topology.\n   */\n  modules?: ModuleDef[];\n  /**\n   * Ordered shared layer vocabulary. Order defines the one-way inner flow.\n   * In module-first topology the same layer definitions repeat inside each\n   * declared module; a module may omit any physical layer folder.\n   */\n  layers: LayerDef[];\n  /**\n   * Layer file glob(s). Layer-first custom patterns require \`{layer}\`;\n   * module-first custom patterns require both \`{module}\` and \`{layer}\`.\n   */\n`,
);

replaceExact(
  'src/config/types.ts',
  '   * The load-bearing block: layers, flow, alias, module shape — everything\n',
  '   * The load-bearing block: modules, layers, flow, alias, unit shape — everything\n',
);

// ---------------------------------------------------------------------------
// Graph helpers: outer module names are no longer confused with inner units.
// ---------------------------------------------------------------------------
write('src/config/graph.ts', `import type { AllowedImporter, ArchitectureDef, LayerDef } from './types';

/** A directed edge (\`from\` imports \`to\`) for the Explain diagram. */
export interface DiagramEdge {
  from: string;
  to: string;
  selfOnly?: boolean;
  description?: string;
  /** True when the edge records declaration order rather than an explicit importer relation. */
  ordered?: boolean;
}

export function normalizeAllowedImporters(
  allowed: (string | AllowedImporter)[] | undefined,
): AllowedImporter[] {
  return (allowed ?? []).map((entry) =>
    typeof entry === 'string' ? { layer: entry } : entry,
  );
}

function importerNames(layers: LayerDef[], index: number): string[] {
  const { allowedImporters } = layers[index];

  return allowedImporters
    ? normalizeAllowedImporters(allowedImporters).map((importer) => importer.layer)
    : layers.slice(0, index).map((layer) => layer.name);
}

export function getForbiddenLayers(architecture: ArchitectureDef, layerName: string): string[] {
  const { layers } = architecture;

  return layers
    .filter(
      (layer, index) =>
        layer.name !== layerName && !importerNames(layers, index).includes(layerName),
    )
    .map((layer) => layer.name);
}

/** An alias paired with the path segments between its target and sourceRoot. */
export interface AliasRoot {
  alias: string;
  /** Segments to cross from the alias target to reach sourceRoot. */
  prefix: string[];
  /** Segments the alias target contributes below sourceRoot. */
  prepend?: string[];
}

export function aliasLayerRoots(architecture: ArchitectureDef): AliasRoot[] {
  const sourceRoot = architecture.sourceRoot ?? 'src';

  return [
    { alias: architecture.alias, prefix: [] },
    ...Object.entries(architecture.additionalAliases ?? {}).flatMap(([alias, target]) =>
      aliasRoot(alias, target, sourceRoot) ?? []),
  ];
}

export function aliasRoot(alias: string, target: string, sourceRoot: string): AliasRoot | null {
  const src = dirSegments(sourceRoot);
  const segments = dirSegments(target);

  if (segments.every((segment, i) => src[i] === segment)) {
    return { alias, prefix: src.slice(segments.length) };
  }

  if (src.every((segment, i) => segments[i] === segment)) {
    return { alias, prefix: [], prepend: segments.slice(src.length) };
  }

  return null;
}

export function aliasPathSpecifier(root: AliasRoot | string, path: string[]): string | null {
  if (typeof root === 'string') {
    return [root, ...path].join('/');
  }

  if (root.prepend?.length) {
    if (!root.prepend.every((segment, index) => path[index] === segment)) {
      return null;
    }

    const rest = path.slice(root.prepend.length);

    return rest.length ? [root.alias, ...rest].join('/') : root.alias;
  }

  return [root.alias, ...root.prefix, ...path].join('/');
}

export function aliasSpecifier(
  root: AliasRoot | string,
  layer: string,
  module?: string,
): string | null {
  return aliasPathSpecifier(root, module === undefined ? [layer] : [module, layer]);
}

function dirSegments(dir: string): string[] {
  return dir.split('/').filter((segment) => segment !== '' && segment !== '.');
}

export function getUnitShape(
  architecture: ArchitectureDef,
  layerName: string,
): { layout: 'folder' | 'file'; entry: string } {
  const layer = architecture.layers.find((candidate) => candidate.name === layerName);

  return {
    layout: layer?.layout ?? 'file',
    entry: layer?.entry ?? 'index',
  };
}

export function getSelfOnlyTargets(architecture: ArchitectureDef, layerName: string): string[] {
  return architecture.layers
    .filter((layer) =>
      normalizeAllowedImporters(layer.allowedImporters).some(
        (importer) => importer.layer === layerName && importer.selfOnly,
      ),
    )
    .map((layer) => layer.name);
}

export function getDiagramEdges(architecture: ArchitectureDef): DiagramEdge[] {
  const { layers } = architecture;
  const edges: DiagramEdge[] = [];

  layers.forEach((layer, index) => {
    if (layer.allowedImporters) {
      for (const importer of normalizeAllowedImporters(layer.allowedImporters)) {
        edges.push({
          from: importer.layer,
          to: layer.name,
          selfOnly: importer.selfOnly,
          description: importer.description,
        });
      }
    } else if (index > 0) {
      edges.push({ from: layers[index - 1].name, to: layer.name, ordered: true });
    }
  });

  return edges;
}
`);

// ---------------------------------------------------------------------------
// Canonical topology resolver. Every consumer can ask one place for module,
// container, layer, and unit identity instead of reparsing path segments.
// ---------------------------------------------------------------------------
write('src/config/resolved.ts', `import type { AllowedImporter, ArchitectureDef, Framework, LayerDef, ModuleDef } from './types';
import {
  aliasLayerRoots,
  aliasPathSpecifier,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
import type { AliasRoot, DiagramEdge } from './graph';

export interface ResolvedUnitShape {
  layout: 'folder' | 'file';
  entry: string;
}

export interface ResolvedLayer {
  definition: LayerDef;
  name: string;
  /** Layer-first physical root. Null when the same layer repeats across modules. */
  root: string | null;
  unit: ResolvedUnitShape;
  allowedImporters: AllowedImporter[];
}

export interface ResolvedModule {
  definition: ModuleDef;
  name: string;
  root: string;
}

export type ResolvedPositionKind
  = | 'source-root'
    | 'undeclared-module'
    | 'module'
    | 'container'
    | 'layer'
    | 'unit';

export type ResolvedInnerPosition = 'container' | 'layer' | null;

export interface ResolveArchitectureContext {
  /** Modules whose descendants are framework-owned Next.js App Router source. */
  nextAppRouterModules?: string[];
}

export interface ResolvedPosition {
  kind: ResolvedPositionKind;
  path: string[];
  module: ResolvedModule | null;
  layer: ResolvedLayer | null;
  unit: string | null;
  /** Stable dependency position consumed by #433: container or declared layer. */
  inner: ResolvedInnerPosition;
}

export interface ResolvedArchitecture {
  definition: ArchitectureDef;
  sourceRoot: string;
  moduleFirst: boolean;
  modules: ResolvedModule[];
  moduleNames: string[];
  layers: ResolvedLayer[];
  layerNames: string[];
  aliases: AliasRoot[];
  aliasMappings: [string, string][];
  ownership: ResolvedLayer[];
  diagramEdges: DiagramEdge[];
  hasSelfOnly: boolean;
  matchModule(file: string | string[]): ResolvedModule | null;
  matchLayer(file: string | string[]): ResolvedLayer | null;
  classify(file: string | string[], context?: ResolveArchitectureContext): ResolvedPosition;
  resolveModuleRoot(module: string): string | null;
  resolveLayerRoot(layer: string): string | null;
  resolveModuleLayerRoot(module: string, layer: string): string | null;
  layerFiles(layer: string, framework: Framework): string[];
  moduleLayerFiles(module: string, layer: string, framework: Framework): string[];
  resolveImportPosition(
    importer: string | string[],
    specifier: string,
    context?: ResolveArchitectureContext,
  ): ResolvedPosition | null;
  resolveImportTarget(importer: string | string[], specifier: string): ResolvedLayer | null;
  canImport(from: string, to: string): boolean;
  forbiddenLayers(layer: string): string[];
  selfOnlyTargets(layer: string): string[];
  aliasSpecifiers(layer: string, module?: string): string[];
}

export function resolveArchitecture(definition: ArchitectureDef): ResolvedArchitecture {
  const sourceRoot = definition.sourceRoot ?? 'src';
  const sourceSegments = segments(sourceRoot);
  const aliases = aliasLayerRoots(definition);
  const moduleFirst = definition.modules !== undefined;

  const modules: ResolvedModule[] = (definition.modules ?? []).map((module) => ({
    definition: module,
    name: module.name,
    root: joinSource(sourceRoot, module.name),
  }));

  const layers: ResolvedLayer[] = definition.layers.map((layer) => ({
    definition: layer,
    name: layer.name,
    root: moduleFirst ? null : joinSource(sourceRoot, layer.name),
    unit: getUnitShape(definition, layer.name),
    allowedImporters: layer.allowedImporters === undefined
      ? definition.layers
          .slice(0, definition.layers.indexOf(layer))
          .map((candidate) => ({ layer: candidate.name }))
      : normalizeAllowedImporters(layer.allowedImporters),
  }));

  const moduleByName = new Map(modules.map((module) => [module.name, module]));
  const layerByName = new Map(layers.map((layer) => [layer.name, layer]));

  const relativeParts = (file: string | string[]): string[] => {
    const parts = Array.isArray(file) ? [...file] : segments(file);

    return startsWith(parts, sourceSegments) ? parts.slice(sourceSegments.length) : parts;
  };

  const classify = (
    file: string | string[],
    context: ResolveArchitectureContext = {},
  ): ResolvedPosition => {
    const path = relativeParts(file);

    if (!path.length) {
      return position('source-root', path);
    }

    if (!moduleFirst) {
      const layer = layerByName.get(path[0]) ?? null;

      if (!layer) {
        return position('source-root', path);
      }

      if (path.length === 1) {
        return position('layer', path, null, layer, null, 'layer');
      }

      return position(
        'unit',
        path,
        null,
        layer,
        unitName(layer.unit, path.slice(1)),
        'layer',
      );
    }

    const module = moduleByName.get(path[0]) ?? null;

    if (!module) {
      return looksLikeFile(path[0])
        ? position('source-root', path)
        : position('undeclared-module', path);
    }

    if (path.length === 1) {
      return position('module', path, module);
    }

    const inside = path.slice(1);
    const layer = layerByName.get(inside[0]) ?? null;

    if (layer) {
      if (inside.length === 1) {
        return position('layer', path, module, layer, null, 'layer');
      }

      return position(
        'unit',
        path,
        module,
        layer,
        unitName(layer.unit, inside.slice(1)),
        'layer',
      );
    }

    if (context.nextAppRouterModules?.includes(module.name)) {
      return position('container', path, module, null, null, 'container');
    }

    if (inside.length === 1 && looksLikeFile(inside[0])) {
      return position('container', path, module, null, null, 'container');
    }

    return position('module', path, module);
  };

  const canImport = (from: string, to: string): boolean => {
    if (from === to) {
      return false;
    }

    return layerByName.get(to)?.allowedImporters.some((entry) => entry.layer === from) ?? false;
  };

  const resolved: ResolvedArchitecture = {
    definition,
    sourceRoot,
    moduleFirst,
    modules,
    moduleNames: modules.map((module) => module.name),
    layers,
    layerNames: layers.map((layer) => layer.name),
    aliases,
    aliasMappings: [
      [definition.alias, sourceRoot],
      ...Object.entries(definition.additionalAliases ?? {}),
    ],
    ownership: layers.filter((layer) => layer.definition.owns?.length),
    diagramEdges: layers.flatMap((layer, index): DiagramEdge[] => {
      if (layer.definition.allowedImporters !== undefined) {
        return layer.allowedImporters.map((importer) => ({
          from: importer.layer,
          to: layer.name,
          selfOnly: importer.selfOnly,
          description: importer.description,
        }));
      }

      return index === 0
        ? []
        : [{ from: layers[index - 1].name, to: layer.name, ordered: true }];
    }),
    hasSelfOnly: layers.some((layer) =>
      layer.allowedImporters.some((importer) => importer.selfOnly === true)),
    matchModule(file) {
      return classify(file).module;
    },
    matchLayer(file) {
      return classify(file).layer;
    },
    classify,
    resolveModuleRoot(module) {
      return moduleByName.get(module)?.root ?? null;
    },
    resolveLayerRoot(layer) {
      return moduleFirst ? null : layerByName.get(layer)?.root ?? null;
    },
    resolveModuleLayerRoot(module, layer) {
      if (!moduleFirst || !moduleByName.has(module) || !layerByName.has(layer)) {
        return null;
      }

      return joinSource(sourceRoot, module, layer);
    },
    layerFiles(layer, framework) {
      if (!moduleFirst) {
        return resolveLayerFilePatterns(layer, framework, {
          layerFiles: definition.layerFiles,
          layerRoot: layerByName.get(layer)?.root ?? joinSource(sourceRoot, layer),
          sourceRoot,
        });
      }

      return modules.flatMap((module) => resolved.moduleLayerFiles(module.name, layer, framework));
    },
    moduleLayerFiles(module, layer, framework) {
      const root = resolved.resolveModuleLayerRoot(module, layer);

      if (root === null) {
        return [];
      }

      return resolveLayerFilePatterns(layer, framework, {
        layerFiles: definition.layerFiles,
        layerRoot: root,
        sourceRoot,
        module,
      });
    },
    resolveImportPosition(importer, specifier, context) {
      const aliasTarget = resolveAliasPath(aliases, specifier);

      if (aliasTarget !== undefined) {
        return aliasTarget === null ? null : classify(aliasTarget, context);
      }

      if (!specifier.startsWith('.')) {
        return null;
      }

      const importerParts = relativeParts(importer);
      const target = resolveRelative(importerParts.slice(0, -1), specifier);

      return target ? classify(target, context) : null;
    },
    resolveImportTarget(importer, specifier) {
      return resolved.resolveImportPosition(importer, specifier)?.layer ?? null;
    },
    canImport,
    forbiddenLayers(layer) {
      return layers.filter((target) => target.name !== layer && !canImport(layer, target.name))
        .map((target) => target.name);
    },
    selfOnlyTargets(layer) {
      return layers.filter((target) => target.allowedImporters
        .some((importer) => importer.layer === layer && importer.selfOnly))
        .map((target) => target.name);
    },
    aliasSpecifiers(layer, module) {
      if (moduleFirst && module === undefined) {
        return modules.flatMap((candidate) =>
          aliases.flatMap((root) => aliasPathSpecifier(root, [candidate.name, layer]) ?? []));
      }

      return aliases.flatMap((root) =>
        aliasPathSpecifier(root, module === undefined ? [layer] : [module, layer]) ?? []);
    },
  };

  return resolved;
}

function position(
  kind: ResolvedPositionKind,
  path: string[],
  module: ResolvedModule | null = null,
  layer: ResolvedLayer | null = null,
  unit: string | null = null,
  inner: ResolvedInnerPosition = null,
): ResolvedPosition {
  return { kind, path, module, layer, unit, inner };
}

function unitName(shape: ResolvedUnitShape, path: string[]): string | null {
  const first = path[0];

  if (!first) {
    return null;
  }

  return shape.layout === 'folder' ? stripExtension(first) : stripExtension(first);
}

function stripExtension(value: string): string {
  return value.replace(/\\.[^.]+$/, '');
}

function looksLikeFile(value: string): boolean {
  return /\\.[A-Za-z0-9]+$/.test(value);
}

const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,ts,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
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
  const declared = scope.layerFiles === undefined
    ? [\`${'${scope.layerRoot ?? joinSource(sourceRoot, \'{layer}\')}'}/**/*.{${'${FRAMEWORK_EXTS[framework]}'} }\`.replace('} }', '}}')]
    : toArray(scope.layerFiles);

  return declared.map((glob) => glob
    .replace(/\\{\\s*module\\s*\\}/g, () => scope.module ?? '{module}')
    .replace(/\\{\\s*layer\\s*\\}/g, () => layer));
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function resolveAliasPath(
  aliases: AliasRoot[],
  specifier: string,
): string[] | null | undefined {
  const root = aliases.find(
    (candidate) => specifier === candidate.alias || specifier.startsWith(\`${'${candidate.alias}'}/\`),
  );

  if (!root) {
    return undefined;
  }

  const parts = specifier.slice(root.alias.length).split('/').filter(Boolean);

  if (!startsWith(parts, root.prefix)) {
    return null;
  }

  return [...(root.prepend ?? []), ...parts.slice(root.prefix.length)];
}

function joinSource(sourceRoot: string, ...parts: string[]): string {
  return [sourceRoot === '.' ? '' : sourceRoot, ...parts].filter(Boolean).join('/');
}

function segments(value: string): string[] {
  return value.split(/[\\\\/]/).filter((part) => part !== '' && part !== '.');
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
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
`);

// Fix the intentionally awkward nested-template line above into the exact TS source we want.
replaceExact(
  'src/config/resolved.ts',
  "    ? [`${scope.layerRoot ?? joinSource(sourceRoot, '{layer}')}/**/*.{${FRAMEWORK_EXTS[framework]} }`.replace('} }', '}}')]\n",
  "    ? [`${scope.layerRoot ?? joinSource(sourceRoot, '{layer}')}/**/*.{${FRAMEWORK_EXTS[framework]}}`]\n",
);

// ---------------------------------------------------------------------------
// Runtime validation and migration guidance.
// ---------------------------------------------------------------------------
let define = read('src/config/defineBlueprint.ts');
define = define.replace(
  "  LayerDef,\n  ModuleDef,\n  RuleSetting,",
  "  LayerDef,\n  ModuleDef,\n  RuleSetting,",
);
define = define.replace(
  "const LAYER_PLACEHOLDER = /\\{\\s*layer\\s*\\}/;",
  "const LAYER_PLACEHOLDER = /\\{\\s*layer\\s*\\}/;\nconst MODULE_PLACEHOLDER = /\\{\\s*module\\s*\\}/;",
);
define = define.replace(
  "  'layers',\n  'module',\n  'layerFiles',",
  "  'modules',\n  'layers',\n  'layerFiles',",
);
define = define.replace(
  "  'owns',\n  'module',\n  'allowedImporters',",
  "  'owns',\n  'layout',\n  'entry',\n  'allowedImporters',",
);
define = define.replace(
  "     module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },\n",
  "     // Optional module-first topology: modules: [{ name: 'auth', does: 'Authentication' }],\n",
);
define = define.replace(
  "  rejectUnknownKeys(architecture, ARCHITECTURE_KEYS, 'architecture');\n\n  const { alias, additionalAliases, layers, module, layerFiles } = architecture;",
  "  if ('module' in (architecture as unknown as Record<string, unknown>)) {\n    throw new Error('architecture.module was removed in Blueprint 4.0 — move layout / entry onto each layer. module.private has no replacement.');\n  }\n\n  rejectUnknownKeys(architecture, ARCHITECTURE_KEYS, 'architecture');\n\n  const { alias, additionalAliases, modules, layers, layerFiles } = architecture;",
);
define = define.replace(
  "  validateLayers(layers);\n  validateModule(module);\n  validateAdditionalAliases(additionalAliases);\n  validateLayerFiles(layerFiles);",
  "  validateModules(modules);\n  validateLayers(layers);\n  validateAdditionalAliases(additionalAliases);\n  validateLayerFiles(layerFiles, modules !== undefined);",
);
define = define.replace(
  "    validateLayerName(layer, names);\n    rejectUnknownKeys(layer, LAYER_KEYS, `layer \\\"${layer.name}\\\"`);\n    validateOwns(layer);\n    validateLayerModule(layer);\n    validateLintOverrides(layer);",
  "    rejectRetiredLayerShape(layer);\n    validateLayerName(layer, names);\n    rejectUnknownKeys(layer, LAYER_KEYS, `layer \\\"${layer.name}\\\"`);\n    validateOwns(layer);\n    validateLayerUnit(layer);\n    validateLintOverrides(layer);",
);

const moduleStart = define.indexOf('function validateModule(');
const aliasStart = define.indexOf('function validateAdditionalAliases(');
if (moduleStart === -1 || aliasStart === -1 || aliasStart <= moduleStart) {
  throw new Error('implement-434-v2: defineBlueprint validateModule block not found');
}
define = define.slice(0, moduleStart) + `function validateModules(modules: ModuleDef[] | undefined): void {
  if (modules === undefined) {
    return;
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('architecture.modules must be a non-empty array when provided. Omit it for layer-first topology.');
  }

  const exact = new Set<string>();
  const folded = new Map<string, string>();

  for (const module of modules) {
    if (!module || typeof module.name !== 'string' || !module.name.trim()) {
      throw new Error('Each module must have a non-empty name.');
    }

    rejectUnknownKeys(module, ['name', 'does'], \`module "\${module.name}"\`);

    if (!/^[A-Za-z0-9._-]+$/.test(module.name) || module.name === '.' || module.name === '..') {
      throw new Error(
        \`Module "\${module.name}" is not a safe one-segment source-root folder name — \`
        + 'stick to letters, digits, ".", "_", "-".',
      );
    }

    if (exact.has(module.name)) {
      throw new Error(\`Duplicate module name: "\${module.name}".\`);
    }

    const key = module.name.toLocaleLowerCase('en-US');
    const collision = folded.get(key);

    if (collision !== undefined) {
      throw new Error(
        \`Module names "\${collision}" and "\${module.name}" collide on case-insensitive filesystems.\`,
      );
    }

    exact.add(module.name);
    folded.set(key, module.name);
  }
}

` + define.slice(aliasStart);

define = define.replace(
  "function validateLayerFiles(layerFiles: string | string[] | undefined): void {\n  const globs = layerFiles === undefined ? [] : [layerFiles].flat();\n\n  for (const glob of globs) {\n    if (!LAYER_PLACEHOLDER.test(glob)) {\n      throw new Error(`layerFiles entry \\\"${glob}\\\" must include the \\\"{layer}\\\" placeholder.`);\n    }\n  }\n}",
  "function validateLayerFiles(\n  layerFiles: string | string[] | undefined,\n  moduleFirst: boolean,\n): void {\n  const globs = layerFiles === undefined ? [] : [layerFiles].flat();\n\n  for (const glob of globs) {\n    if (!LAYER_PLACEHOLDER.test(glob)) {\n      throw new Error(`layerFiles entry \\\"${glob}\\\" must include the \\\"{layer}\\\" placeholder.`);\n    }\n\n    if (moduleFirst && !MODULE_PLACEHOLDER.test(glob)) {\n      throw new Error(`module-first layerFiles entry \\\"${glob}\\\" must include both \\\"{module}\\\" and \\\"{layer}\\\" placeholders.`);\n    }\n\n    if (!moduleFirst && MODULE_PLACEHOLDER.test(glob)) {\n      throw new Error(`layer-first layerFiles entry \\\"${glob}\\\" must not use \\\"{module}\\\" — omit architecture.modules or remove that placeholder.`);\n    }\n  }\n}",
);

const layerModuleStart = define.indexOf('function validateLayerModule(');
const allowedStart = define.indexOf('function validateAllowedImporters(');
if (layerModuleStart === -1 || allowedStart === -1 || allowedStart <= layerModuleStart) {
  throw new Error('implement-434-v2: validateLayerModule block not found');
}
define = define.slice(0, layerModuleStart) + `function rejectRetiredLayerShape(layer: LayerDef): void {
  if (layer && 'module' in (layer as unknown as Record<string, unknown>)) {
    throw new Error(
      \`Layer "\${layer.name ?? '<unknown>'}" uses layers[].module, removed in Blueprint 4.0 — move layout / entry directly onto the layer.\`,
    );
  }
}

function validateLayerUnit(layer: LayerDef): void {
  if (layer.layout !== undefined && layer.layout !== 'folder' && layer.layout !== 'file') {
    if ((layer.layout as unknown) === 'flat') {
      throw new Error(
        \`Layer "\${layer.name}" uses layout "flat", renamed to "file" in Blueprint 4.0.\`,
      );
    }

    throw new Error(
      \`Layer "\${layer.name}" has layout "\${String(layer.layout)}" — expected folder | file.\`,
    );
  }

  if (layer.entry !== undefined && (typeof layer.entry !== 'string' || !layer.entry.trim())) {
    throw new Error(\`Layer "\${layer.name}" has an empty entry. Omit it for "index".\`);
  }
}

` + define.slice(allowedStart);
write('src/config/defineBlueprint.ts', define);

// ---------------------------------------------------------------------------
// Export the new helper vocabulary.
// ---------------------------------------------------------------------------
write('src/config/index.ts', `export { defineBlueprint, normalizeAgentEmit, validateBlueprint } from './defineBlueprint';
export {
  aliasPathSpecifier,
  aliasRoot,
  aliasSpecifier,
  aliasLayerRoots,
  getDiagramEdges,
  getForbiddenLayers,
  getSelfOnlyTargets,
  getUnitShape,
  normalizeAllowedImporters,
} from './graph';
export type { AliasRoot, DiagramEdge } from './graph';
export { activeSetting, readSetting } from './settings';
export type { ReadSetting } from './settings';
export { resolveArchitecture, resolveLayerFilePatterns } from './resolved';
export type {
  ResolvedArchitecture,
  ResolvedInnerPosition,
  ResolvedLayer,
  ResolvedModule,
  ResolvedPosition,
  ResolvedPositionKind,
  ResolvedUnitShape,
  ResolveArchitectureContext,
} from './resolved';
export { sourcePath, sourceRoot, sourceRootLabel, stripSourceRoot } from './source';
export type * from './types';
`);

// ---------------------------------------------------------------------------
// Preserve existing preset enforcement while migrating spelling.
// ---------------------------------------------------------------------------
let presets = read('src/presets/presets.ts');
presets = presets.replace(
  "      layers: [\n",
  "      layers: [\n",
);
// Base React/Vue preset had one shared folder shape. Apply that shape per layer.
presets = presets.replace(
  "      module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },\n",
  "      // Blueprint 4.0: unit shape lives on each layer.\n",
);
presets = presets.replace(
  "      naming: {\n        component:",
  "      layers: undefined as never,\n      naming: {\n        component:",
);
// Reconstruct the first architecture.layers expression with per-layer folder unit shape.
const firstLayersStart = presets.indexOf('      layers: [');
const firstNaming = presets.indexOf('      layers: undefined as never,\n      naming:', firstLayersStart);
if (firstLayersStart === -1 || firstNaming === -1) {
  throw new Error('implement-434-v2: base preset layers block not found');
}
const firstBlock = presets.slice(firstLayersStart, firstNaming);
const convertedFirstBlock = firstBlock.replace(/\n      \],\n$/, "\n      ].map((layer) => ({ ...layer, layout: 'folder' as const, entry: 'index' })),\n");
presets = presets.slice(0, firstLayersStart) + convertedFirstBlock
  + presets.slice(firstNaming).replace('      layers: undefined as never,\n', '');
// Next's old flat shape maps to the new file default, so only remove the retired block.
presets = presets.replace(
  "      module: { layout: 'flat', entry: 'index', private: [] },\n",
  '',
);
presets = presets.replace('top layer — flat module layout', 'top layer — file unit layout');
write('src/presets/presets.ts', presets);

console.log('implement-434-v2: core topology/config rewrite complete');
