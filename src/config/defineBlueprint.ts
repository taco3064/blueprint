import type {
  AgentEmitEntry,
  AgentTarget,
  ArchitectureDef,
  Blueprint,
  EmitDef,
  LayerDef,
  ModuleDef,
  RuleSetting,
} from './types';
import { normalizeAllowedImporters } from './graph';
import { resolveArchitecture } from './resolved';
import { activeSetting } from './settings';

const VALID_TIERS = ['error', 'warn', 'off'];
const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/;

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
  'layers',
  'module',
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
  'module',
  'allowedImporters',
  'lintOverrides',
];

const MISPLACED_KEYS: Record<string, string> = {
  selfOnly: 'selfOnly lives on an allowedImporters ENTRY, naming the importing layer: '
    + 'allowedImporters: [{ layer: \'views\', selfOnly: true }]',
};

const MANAGED_RULES = [
  'no-restricted-imports',
  'no-restricted-syntax',
  'no-restricted-globals',
  'max-lines',
  'blueprint/no-deep-watch',
  'blueprint/use-prefix',
];

/**
 * Author a Blueprint. Validates referential integrity up front, then returns
 * the config unchanged — the single source every emitter compiles from.
 *
 * @group Author
 * @example
 * export default defineBlueprint({
 *   framework: 'auto',
 *   architecture: {
 *     alias: '~app',
 *     layers: [
 *       { name: 'components', does: 'Reusable, presentational UI', mustNot: ['import services'] },
 *       { name: 'hooks', does: 'Adapts server and shared state' },
 *       { name: 'services', does: 'Network primitives', owns: ['axios', { global: 'fetch' }] },
 *     ],
 *     module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
 *   },
 * });
 */
export function defineBlueprint(config: Blueprint): Blueprint {
  return validateBlueprint(config);
}

/**
 * Throws with a precise message if the blueprint is structurally invalid;
 * returns it unchanged otherwise, so a passing call is visible at runtime —
 * a bare `undefined` read as "did this even run?" in the field.
 * @group Author
 */
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
    throw new Error('name must be a non-empty string when provided.');
  }
}

function validateArchitecture(architecture: ArchitectureDef | undefined): void {
  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  rejectUnknownKeys(architecture, ARCHITECTURE_KEYS, 'architecture');

  const { alias, additionalAliases, layers, module, layerFiles } = architecture;

  if (typeof alias !== 'string' || !alias.trim()) {
    throw new Error('architecture.alias must be a non-empty string.');
  }

  if (layers.length === 0) {
    throw new Error('architecture.layers must not be empty.');
  }

  validateLayers(layers);
  validateModule(module);
  validateAdditionalAliases(additionalAliases);
  validateLayerFiles(layerFiles);
}

function validateLayers(layers: LayerDef[]): void {
  const names = new Set<string>();

  for (const layer of layers) {
    validateLayerName(layer, names);
    rejectUnknownKeys(layer, LAYER_KEYS, `layer "${layer.name}"`);
    validateOwns(layer);
    validateLayerModule(layer);
    validateLintOverrides(layer);

    validateAllowedImporters(layer, names);
    names.add(layer.name);
  }
}

function validateLayerName(layer: LayerDef, earlier: Set<string>): void {
  if (typeof layer?.name !== 'string' || !layer.name.trim()) {
    throw new Error('Each layer must have a non-empty name.');
  } else if (earlier.has(layer.name)) {
    throw new Error(`Duplicate layer name: "${layer.name}".`);
  } else if (/[*?{}[\]\\/]/.test(layer.name)) {
    throw new Error(
      `Layer "${layer.name}" contains glob or path characters — layer names become `
      + 'file globs and folders. Root files are wiring, not a layer: leave their '
      + 'hygiene to the project\'s own lint instead of widening the net.',
    );
  } else if (/[\s"'()<>|;%&]/.test(layer.name)) {
    throw new Error(
      `Layer "${layer.name}" contains characters that corrupt emitted artifacts `
      + '— a layer name becomes a folder, a file glob, and a diagram node. '
      + 'Stick to letters, digits, ".", "_", "-".',
    );
  }
}

function validateModule(module: ModuleDef | undefined): void {
  if (module === undefined) {
    return;
  }

  if (module.layout !== undefined && module.layout !== 'folder' && module.layout !== 'flat') {
    throw new Error(
      `architecture.module.layout is "${String(module.layout)}" — expected folder | flat, `
      + 'or omit it for the default (flat).',
    );
  }

  if (module.entry !== undefined && (typeof module.entry !== 'string' || !module.entry.trim())) {
    throw new Error(
      'architecture.module.entry must be a non-empty string when set '
      + '— omit it for the default ("index").',
    );
  }

  if (module.private !== undefined && !Array.isArray(module.private)) {
    throw new Error('architecture.module.private must be an array when set — omit it for none.');
  }

  rejectUnknownKeys(module, ['layout', 'entry', 'private'], 'architecture.module');
}

function validateAdditionalAliases(aliases: Record<string, string> | undefined): void {
  if (aliases === undefined) {
    return;
  }

  const entries = Object.entries(aliases);

  if (
    typeof aliases !== 'object'
    || entries.some(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim())
  ) {
    throw new Error(
      'architecture.additionalAliases must map non-empty strings to non-empty strings.',
    );
  }
}

function validateLayerFiles(layerFiles: string | string[] | undefined): void {
  const globs = layerFiles === undefined ? [] : [layerFiles].flat();

  for (const glob of globs) {
    if (!LAYER_PLACEHOLDER.test(glob)) {
      throw new Error(`layerFiles entry "${glob}" must include the "{layer}" placeholder.`);
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
      throw new Error(`Each ${subject} must have a non-empty id.`);
    } else if (seen.has(item.id)) {
      throw new Error(`Duplicate ${subject} id: "${item.id}".`);
    }

    seen.add(item.id);
  }
}

function validatePlaybook(bp: Blueprint): void {
  const ids = new Set<string>();

  for (const section of bp.playbook ?? []) {
    if (typeof section?.title !== 'string' || !section.title.trim()) {
      throw new Error('Each playbook section must have a non-empty title.');
    }

    for (const rule of section.rules ?? []) {
      if (typeof rule?.id !== 'string' || !rule.id.trim()) {
        throw new Error(`Playbook section "${section.title}" has a rule with no id.`);
      } else if (ids.has(rule.id)) {
        throw new Error(`Duplicate playbook rule id: "${rule.id}".`);
      }

      ids.add(rule.id);
    }
  }
}

function validateRuleTiers(rules: Blueprint['rules']): void {
  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw new Error(`Rule "${id}" has an invalid tier — expected error | warn | off.`);
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
    throw new Error(
      `Rule "usePrefix" targets layer "${layer}", which is not a declared layer — set its "layer" option.`,
    );
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
      throw new Error(
        `emit.agents target "${entry.target}" is unknown — expected ${AGENT_TARGETS.join(' | ')}.`,
      );
    } else if (seen.has(entry.target)) {
      throw new Error(`emit.agents lists target "${entry.target}" more than once.`);
    } else if (entry.path !== undefined && (typeof entry.path !== 'string' || !entry.path.trim())) {
      throw new Error(`emit.agents target "${entry.target}" has an empty path.`);
    }

    seen.add(entry.target);
  }
}

function rejectUnknownKeys(value: object, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) {
      continue;
    }

    throw new Error(
      `Unknown key "${key}" in ${where} — nothing reads it, so the declaration is `
      + `silently dead. ${MISPLACED_KEYS[key] ?? `Expected keys: ${allowed.join(', ')}.`}`,
    );
  }
}

function validateOwns(layer: LayerDef): void {
  if (!layer.owns) {
    return;
  }

  for (const primitive of layer.owns) {
    if (typeof primitive === 'string') {
      if (!primitive.trim()) {
        throw new Error(`Layer "${layer.name}" owns an empty package name.`);
      }
    } else if ('global' in primitive) {
      if (typeof primitive.global !== 'string' || !primitive.global.trim()) {
        throw new Error(`Layer "${layer.name}" owns a global with no name.`);
      }

      rejectUnknownKeys(primitive, ['global'], `layer "${layer.name}" owns entry "${primitive.global}"`);
    } else if (typeof primitive.package !== 'string' || !primitive.package.trim()) {
      throw new Error(`Layer "${layer.name}" owns a package with no name.`);
    } else {
      rejectUnknownKeys(primitive, ['package', 'imports', 'pattern', 'exempt'], `layer "${layer.name}" owns entry "${primitive.package}"`);
    }
  }
}

function validateLayerModule(layer: LayerDef): void {
  const override = layer.module;

  if (override === undefined) {
    return;
  }

  rejectUnknownKeys(override, ['layout', 'entry'], `layer "${layer.name}" module override`);

  if (override.layout !== undefined && !['folder', 'flat'].includes(override.layout)) {
    throw new Error(
      `Layer "${layer.name}" has module.layout "${override.layout}" — expected folder | flat.`,
    );
  }

  if (
    override.entry !== undefined
    && (typeof override.entry !== 'string' || !override.entry.trim())
  ) {
    throw new Error(`Layer "${layer.name}" has an empty module.entry override.`);
  }
}

function validateAllowedImporters(layer: LayerDef, earlier: Set<string>): void {
  const seen = new Set<string>();

  for (const importer of normalizeAllowedImporters(layer.allowedImporters)) {
    if (typeof importer.layer !== 'string' || !importer.layer.trim()) {
      throw new Error(`Layer "${layer.name}" has an allowedImporters entry with no layer.`);
    }

    rejectUnknownKeys(
      importer,
      ['layer', 'selfOnly', 'description'],
      `layer "${layer.name}" allowedImporters entry "${importer.layer}"`,
    );

    if (importer.layer === layer.name) {
      throw new Error(`Layer "${layer.name}" cannot list itself as an allowed importer.`);
    } else if (!earlier.has(importer.layer)) {
      throw new Error(
        `Layer "${layer.name}" allows importer "${importer.layer}", which is not a layer declared before it.`,
      );
    } else if (seen.has(importer.layer)) {
      throw new Error(`Layer "${layer.name}" lists importer "${importer.layer}" more than once.`);
    }

    seen.add(importer.layer);
  }
}

function validateLintOverrides(layer: LayerDef): void {
  for (const rule of Object.keys(layer.lintOverrides ?? {})) {
    if (MANAGED_RULES.includes(rule)) {
      throw new Error(
        `Layer "${layer.name}" may not override "${rule}" — it is managed by the Enforce emitter.`,
      );
    }
  }
}

function resolveTier(setting: RuleSetting): string {
  return typeof setting === 'string' ? setting : setting?.tier;
}
