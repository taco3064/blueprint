import type {
  AgentEmitEntry,
  AgentTarget,
  ArchitectureDef,
  Blueprint,
  EmitDef,
  LayerDef,
  RuleSetting,
} from './types';
import { normalizeAllowedImporters } from './graph';
import { migrateLegacyBlueprint } from './legacy';
import { resolveArchitecture } from './resolved';
import { activeSetting } from './settings';
import { configValidationError } from './validation';

const VALID_TIERS = ['error', 'warn', 'off'];
const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/;
const MODULE_PLACEHOLDER = /\{\s*module\s*\}/;

const AGENT_TARGETS = ['claude', 'agents', 'gemini', 'copilot', 'cursor', 'windsurf'];
const DEFAULT_AGENT_TARGETS: AgentTarget[] = ['claude', 'agents'];

const BLUEPRINT_KEYS = [
  'name',
  'framework',
  'architecture',
  'rules',
  'principles',
  'componentShape',
  'playbook',
  'emit',
];

const ARCHITECTURE_KEYS = [
  'alias',
  'additionalAliases',
  'sourceRoot',
  'modules',
  'layers',
  'layerFiles',
  'layerFilesIgnore',
  'testFiles',
  'naming',
];

const LAYER_KEYS = [
  'name',
  'does',
  'mustNot',
  'owns',
  'layout',
  'entry',
  'allowedImporters',
  'lintOverrides',
];

const MANAGED_RULES = [
  'no-restricted-imports',
  'no-restricted-syntax',
  'no-restricted-globals',
  'max-lines',
  'blueprint/no-deep-watch',
  'blueprint/use-prefix',
];

export function defineBlueprint(config: Blueprint): Blueprint {
  const migration = migrateLegacyBlueprint(config);

  return validateBlueprint(migration.blueprint);
}

export function validateBlueprint(bp: Blueprint): Blueprint {
  validateName(bp.name);
  rejectUnknownKeys(bp, BLUEPRINT_KEYS, 'the blueprint');
  validateArchitecture(bp.architecture);
  validateEmit(bp.emit);
  validateUniqueIds(bp.principles ?? [], 'principle');
  validateUniqueIds(bp.componentShape ?? [], 'component-shape axis');
  validatePlaybook(bp);
  validateRuleTiers(bp.rules);
  validateUsePrefix(bp);
  validateAgentEmit(bp);
  resolveArchitecture(bp.architecture);

  return bp;
}

function validateName(name: string | undefined): void {
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw configValidationError({ kind: 'blueprint-name' });
  }
}

function validateArchitecture(architecture: ArchitectureDef | undefined): void {
  if (!architecture || !Array.isArray(architecture.layers)) {
    throw configValidationError({ kind: 'architecture-layers-array' });
  }

  rejectRetiredArchitectureModule(architecture);
  rejectUnknownKeys(architecture, ARCHITECTURE_KEYS, 'architecture');

  const { alias, additionalAliases, modules, layers, layerFiles } = architecture;

  if (typeof alias !== 'string' || !alias.trim()) {
    throw configValidationError({ kind: 'architecture-alias' });
  }

  if (layers.length === 0) {
    throw configValidationError({ kind: 'architecture-layers-empty' });
  }

  validateLayers(layers);
  validateModules(modules);
  validateAdditionalAliases(additionalAliases);
  validateLayerFiles(layerFiles, modules !== undefined);
}

function validateLayers(layers: LayerDef[]): void {
  const names = new Set<string>();

  for (const layer of layers) {
    validateLayerName(layer, names);
    rejectRetiredLayerModule(layer);
    rejectUnknownKeys(layer, LAYER_KEYS, `layer "${layer.name}"`);
    validateOwns(layer);
    validateUnitShape(layer);
    validateLintOverrides(layer);

    validateAllowedImporters(layer, names);
    names.add(layer.name);
  }
}

function validateLayerName(layer: LayerDef, earlier: Set<string>): void {
  if (typeof layer?.name !== 'string' || !layer.name.trim()) {
    throw configValidationError({ kind: 'layer-name-empty' });
  } else if (earlier.has(layer.name)) {
    throw configValidationError({ kind: 'duplicate-layer', name: layer.name });
  } else if (/[*?{}[\]\\/]/.test(layer.name)) {
    throw configValidationError({ kind: 'layer-name-path', name: layer.name });
  } else if (/[\s"'()<>|;%&]/.test(layer.name)) {
    throw configValidationError({ kind: 'layer-name-artifact', name: layer.name });
  }
}

function validateModules(modules: ArchitectureDef['modules']): void {
  if (modules === undefined) {
    return;
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    throw configValidationError({ kind: 'modules-empty' });
  }

  const names = new Map<string, string>();

  for (const module of modules) {
    validateArchitectureName(module?.name, 'module');
    rejectUnknownKeys(module, ['name', 'does', 'dependsOn'], `module "${module.name}"`);

    if (typeof module.does !== 'string' || !module.does.trim()) {
      throw configValidationError({ kind: 'module-does', module: module.name });
    }

    validateModuleDependencies(module);

    const collision = names.get(module.name.toLocaleLowerCase('en-US'));

    if (collision !== undefined) {
      throw configValidationError({
        kind: 'module-case-collision', first: collision, second: module.name,
      });
    }

    names.set(module.name.toLocaleLowerCase('en-US'), module.name);
  }
}

function validateModuleDependencies(module: NonNullable<ArchitectureDef['modules']>[number]): void {
  if (module.dependsOn !== undefined && !Array.isArray(module.dependsOn)) {
    throw configValidationError({ kind: 'module-depends-array', module: module.name });
  }
}

function validateAdditionalAliases(
  aliases: Record<string, string> | undefined,
): void {
  if (aliases === undefined) {
    return;
  }

  if (
    aliases === null
    || typeof aliases !== 'object'
    || Object.entries(aliases).some(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim())
  ) {
    throw configValidationError({ kind: 'additional-aliases' });
  }
}

function validateLayerFiles(
  layerFiles: string | string[] | undefined,
  moduleFirst: boolean,
): void {
  const globs = layerFiles === undefined ? [] : [layerFiles].flat();

  for (const glob of globs) {
    if (!LAYER_PLACEHOLDER.test(glob)) {
      throw configValidationError({ kind: 'layer-files-layer', glob });
    }

    if (moduleFirst && !MODULE_PLACEHOLDER.test(glob)) {
      throw configValidationError({ kind: 'module-layer-files', glob });
    }

    if (!moduleFirst && MODULE_PLACEHOLDER.test(glob)) {
      throw configValidationError({ kind: 'layer-layer-files', glob });
    }
  }
}

function validateEmit(emit: EmitDef | undefined): void {
  if (emit === undefined) {
    return;
  }

  rejectUnknownKeys(emit, ['handbook', 'agents', 'lint'], 'emit');

  if (emit.lint !== undefined) {
    rejectUnknownKeys(emit.lint, ['severity'], 'emit.lint');
  }

  for (const entry of emit.agents ?? []) {
    if (typeof entry !== 'string') {
      rejectUnknownKeys(entry, ['target', 'path'], 'an emit.agents entry');
    }
  }
}

function validateUniqueIds(items: { id: string }[], subject: string): void {
  const seen = new Set<string>();

  for (const item of items) {
    if (typeof item?.id !== 'string' || !item.id.trim()) {
      throw configValidationError({ kind: 'id-empty', subject });
    } else if (seen.has(item.id)) {
      throw configValidationError({ kind: 'duplicate-id', subject, id: item.id });
    }

    seen.add(item.id);
  }
}

function validatePlaybook(bp: Blueprint): void {
  const ids = new Set<string>();

  for (const section of bp.playbook ?? []) {
    if (typeof section?.title !== 'string' || !section.title.trim()) {
      throw configValidationError({ kind: 'playbook-title' });
    }

    for (const rule of section.rules ?? []) {
      if (typeof rule?.id !== 'string' || !rule.id.trim()) {
        throw configValidationError({ kind: 'playbook-rule-id', title: section.title });
      } else if (ids.has(rule.id)) {
        throw configValidationError({ kind: 'duplicate-playbook-rule', id: rule.id });
      }

      ids.add(rule.id);
    }
  }
}

function validateRuleTiers(rules: Blueprint['rules']): void {
  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw configValidationError({ kind: 'invalid-tier', id });
    }
  }
}

function validateUsePrefix(bp: Blueprint): void {
  const read = activeSetting(bp.rules?.usePrefix);

  if (read === null) {
    return;
  }

  const layer = (read.opts.layer as string | undefined) ?? 'hooks';

  if (!bp.architecture.layers.some((candidate) => candidate.name === layer)) {
    throw configValidationError({ kind: 'use-prefix-layer', layer });
  }
}

export function normalizeAgentEmit(
  agents: (AgentTarget | AgentEmitEntry)[] | undefined,
  defaultTargets?: AgentTarget[],
): AgentEmitEntry[] {
  return (agents ?? defaultTargets ?? DEFAULT_AGENT_TARGETS).map((entry) =>
    typeof entry === 'string' ? { target: entry } : entry,
  );
}

function validateAgentEmit(bp: Blueprint): void {
  const seen = new Set<string>();

  for (const entry of normalizeAgentEmit(bp.emit?.agents)) {
    if (!AGENT_TARGETS.includes(entry.target)) {
      throw configValidationError({
        kind: 'unknown-agent', target: entry.target, expected: AGENT_TARGETS,
      });
    } else if (seen.has(entry.target)) {
      throw configValidationError({ kind: 'duplicate-agent', target: entry.target });
    } else if (entry.path !== undefined && (typeof entry.path !== 'string' || !entry.path.trim())) {
      throw configValidationError({ kind: 'agent-path', target: entry.target });
    }

    seen.add(entry.target);
  }
}

function rejectUnknownKeys(value: object, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) {
      continue;
    }

    throw configValidationError({ kind: 'unknown-key', key, where, allowed });
  }
}

function validateOwns(layer: LayerDef): void {
  if (!layer.owns) {
    return;
  }

  for (const primitive of layer.owns) {
    if (typeof primitive === 'string') {
      if (!primitive.trim()) {
        throw configValidationError({ kind: 'owned-package-string', layer: layer.name });
      }
    } else if ('global' in primitive) {
      if (typeof primitive.global !== 'string' || !primitive.global.trim()) {
        throw configValidationError({ kind: 'owned-global', layer: layer.name });
      }

      rejectUnknownKeys(primitive, ['global'], `layer "${layer.name}" owns entry "${primitive.global}"`);
    } else if (typeof primitive.package !== 'string' || !primitive.package.trim()) {
      throw configValidationError({ kind: 'owned-package-object', layer: layer.name });
    } else {
      rejectUnknownKeys(primitive, ['package', 'imports', 'pattern', 'exempt'], `layer "${layer.name}" owns entry "${primitive.package}"`);
    }
  }
}

function validateUnitShape(layer: LayerDef): void {
  if ((layer as { layout?: unknown }).layout === 'flat') {
    throw configValidationError({ kind: 'retired-flat', layer: layer.name });
  }

  if (layer.layout !== undefined && !['folder', 'file'].includes(layer.layout)) {
    throw configValidationError({
      kind: 'invalid-layout', layer: layer.name, layout: String(layer.layout),
    });
  }

  if (
    layer.entry !== undefined
    && (typeof layer.entry !== 'string' || !layer.entry.trim())
  ) {
    throw configValidationError({ kind: 'empty-entry', layer: layer.name });
  }
}

function rejectRetiredArchitectureModule(architecture: ArchitectureDef): void {
  if ('module' in architecture) {
    throw configValidationError({ kind: 'retired-architecture-module' });
  }
}

function rejectRetiredLayerModule(layer: LayerDef): void {
  if ('module' in layer) {
    throw configValidationError({ kind: 'retired-layer-module', layer: layer.name });
  }
}

function validateArchitectureName(name: unknown, kind: 'module' | 'layer'): void {
  const title = `${kind[0].toUpperCase()}${kind.slice(1)}`;

  if (typeof name !== 'string' || !name.trim()) {
    throw configValidationError({ kind: 'architecture-name-empty', subject: kind });
  } else if (name === '.' || name === '..' || /[*?{}[\]\\/]/.test(name)) {
    throw configValidationError({ kind: 'architecture-name-path', title, name });
  } else if (/[\s"'()<>|;%&]/.test(name)) {
    throw configValidationError({ kind: 'architecture-name-artifact', title, name });
  }
}

function validateAllowedImporters(layer: LayerDef, earlier: Set<string>): void {
  const seen = new Set<string>();

  for (const importer of normalizeAllowedImporters(layer.allowedImporters)) {
    if (typeof importer.layer !== 'string' || !importer.layer.trim()) {
      throw configValidationError({ kind: 'allowed-importer-empty', layer: layer.name });
    }

    rejectUnknownKeys(
      importer,
      ['layer', 'selfOnly', 'description'],
      `layer "${layer.name}" allowedImporters entry "${importer.layer}"`,
    );

    if (importer.layer === layer.name) {
      throw configValidationError({ kind: 'self-importer', layer: layer.name });
    } else if (!earlier.has(importer.layer)) {
      throw configValidationError({
        kind: 'unknown-importer', layer: layer.name, importer: importer.layer,
      });
    } else if (seen.has(importer.layer)) {
      throw configValidationError({
        kind: 'duplicate-importer', layer: layer.name, importer: importer.layer,
      });
    }

    seen.add(importer.layer);
  }
}

function validateLintOverrides(layer: LayerDef): void {
  for (const rule of Object.keys(layer.lintOverrides ?? {})) {
    if (MANAGED_RULES.includes(rule)) {
      throw configValidationError({ kind: 'managed-rule', layer: layer.name, rule });
    }
  }
}

function resolveTier(setting: RuleSetting): string {
  return typeof setting === 'string' ? setting : setting?.tier;
}
