import type { AgentEmitEntry, AgentTarget, Blueprint, LayerDef, RuleSetting } from './types';
import { normalizeAllowedImporters } from './graph';

const VALID_TIERS = ['error', 'warn', 'off'];
const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/;

const AGENT_TARGETS = ['claude', 'agents', 'gemini', 'copilot', 'cursor', 'windsurf'];
const DEFAULT_AGENT_TARGETS: AgentTarget[] = ['claude', 'agents'];

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
 * @example
 * export default defineBlueprint({
 *   framework: 'auto',
 *   architecture: {
 *     alias: '~app',
 *     layers: [
 *       { name: 'components', does: '可重用 UI', mustNot: ['import services'] },
 *       { name: 'hooks', does: 'inject / 加工 state' },
 *       { name: 'services', does: '網路原件', owns: ['axios', { global: 'fetch' }] },
 *     ],
 *     flow: 'one-way',
 *     module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
 *   },
 * });
 */
export function defineBlueprint(config: Blueprint): Blueprint {
  validateBlueprint(config);

  return config;
}

/** Throws with a precise message if the blueprint is structurally invalid. */
export function validateBlueprint(bp: Blueprint): void {
  const { name, architecture, principles, rules } = bp;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw new Error('name must be a non-empty string when provided.');
  }

  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  const { alias, additionalAliases, layers, module, layerFiles } = architecture;

  if (typeof alias !== 'string' || !alias.trim()) {
    throw new Error('architecture.alias must be a non-empty string.');
  }

  if (layers.length === 0) {
    throw new Error('architecture.layers must not be empty.');
  }

  const names = new Set<string>();

  for (const layer of layers) {
    if (typeof layer?.name !== 'string' || !layer.name.trim()) {
      throw new Error('Each layer must have a non-empty name.');
    } else if (names.has(layer.name)) {
      throw new Error(`Duplicate layer name: "${layer.name}".`);
    }

    validateOwns(layer);
    validateLayerModule(layer);
    validateLintOverrides(layer);
    // `names` holds only earlier layers here, so requiring importers to be in
    // it enforces "declared before" — which keeps the flow one-way and acyclic.
    validateAllowedImporters(layer, names);
    names.add(layer.name);
  }

  if (!module || typeof module.entry !== 'string' || !module.entry.trim()) {
    throw new Error('architecture.module.entry must be a non-empty string.');
  } else if (!Array.isArray(module.private)) {
    throw new Error('architecture.module.private must be an array.');
  }

  if (additionalAliases !== undefined) {
    const entries = Object.entries(additionalAliases);

    if (
      typeof additionalAliases !== 'object'
      || entries.some(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim())
    ) {
      throw new Error(
        'architecture.additionalAliases must map non-empty strings to non-empty strings.',
      );
    }
  }

  for (const glob of layerFiles === undefined
    ? []
    : Array.isArray(layerFiles)
      ? layerFiles
      : [layerFiles]) {
    if (!LAYER_PLACEHOLDER.test(glob)) {
      throw new Error(`layerFiles entry "${glob}" must include the "{layer}" placeholder.`);
    }
  }

  const principleIds = new Set<string>();

  for (const principle of principles ?? []) {
    if (typeof principle?.id !== 'string' || !principle.id.trim()) {
      throw new Error('Each principle must have a non-empty id.');
    } else if (principleIds.has(principle.id)) {
      throw new Error(`Duplicate principle id: "${principle.id}".`);
    }

    principleIds.add(principle.id);
  }

  const axisIds = new Set<string>();

  for (const axis of bp.componentShape ?? []) {
    if (typeof axis?.id !== 'string' || !axis.id.trim()) {
      throw new Error('Each component-shape axis must have a non-empty id.');
    } else if (axisIds.has(axis.id)) {
      throw new Error(`Duplicate component-shape axis id: "${axis.id}".`);
    }

    axisIds.add(axis.id);
  }

  const playbookIds = new Set<string>();

  for (const section of bp.playbook ?? []) {
    if (typeof section?.title !== 'string' || !section.title.trim()) {
      throw new Error('Each playbook section must have a non-empty title.');
    }

    for (const rule of section.rules ?? []) {
      if (typeof rule?.id !== 'string' || !rule.id.trim()) {
        throw new Error(`Playbook section "${section.title}" has a rule with no id.`);
      } else if (playbookIds.has(rule.id)) {
        throw new Error(`Duplicate playbook rule id: "${rule.id}".`);
      }

      playbookIds.add(rule.id);
    }
  }

  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw new Error(`Rule "${id}" has an invalid tier — expected error | warn | off.`);
    }
  }

  validateUsePrefix(bp);
  validateAgentEmit(bp);
}

/** `usePrefix` must target a declared layer (default `hooks`). */
function validateUsePrefix(bp: Blueprint): void {
  const setting = bp.rules?.usePrefix;

  if (setting === undefined) return;

  const layer = (typeof setting === 'string' ? undefined : (setting.layer as string)) ?? 'hooks';

  if (!bp.architecture.layers.some((candidate) => candidate.name === layer)) {
    throw new Error(
      `Rule "usePrefix" targets layer "${layer}", which is not a declared layer — set its "layer" option.`,
    );
  }
}

/** Normalize the mixed `emit.agents` list, applying the default target set. */
export function normalizeAgentEmit(
  agents: (AgentTarget | AgentEmitEntry)[] | undefined,
): AgentEmitEntry[] {
  return (agents ?? DEFAULT_AGENT_TARGETS).map((entry) =>
    typeof entry === 'string' ? { target: entry } : entry,
  );
}

/** Each agents entry must name a known target, at most once, with a non-empty path. */
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

/** Validate a layer's `owns` list — each entry is a package, global, or shorthand. */
function validateOwns(layer: LayerDef): void {
  for (const primitive of layer.owns ?? []) {
    if (typeof primitive === 'string') {
      if (!primitive.trim()) {
        throw new Error(`Layer "${layer.name}" owns an empty package name.`);
      }
    } else if ('global' in primitive) {
      if (typeof primitive.global !== 'string' || !primitive.global.trim()) {
        throw new Error(`Layer "${layer.name}" owns a global with no name.`);
      }
    } else if (typeof primitive.package !== 'string' || !primitive.package.trim()) {
      throw new Error(`Layer "${layer.name}" owns a package with no name.`);
    }
  }
}

/** A layer's `module` override may only narrow layout / entry, both well-formed. */
function validateLayerModule(layer: LayerDef): void {
  const override = layer.module;

  if (override === undefined) return;

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

/** Each allowed importer must be a distinct layer declared before this one. */
function validateAllowedImporters(layer: LayerDef, earlier: Set<string>): void {
  const seen = new Set<string>();

  for (const importer of normalizeAllowedImporters(layer.allowedImporters)) {
    if (typeof importer.layer !== 'string' || !importer.layer.trim()) {
      throw new Error(`Layer "${layer.name}" has an allowedImporters entry with no layer.`);
    } else if (importer.layer === layer.name) {
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

/** The Enforce emitter owns the three managed rules; overriding them is rejected. */
function validateLintOverrides(layer: LayerDef): void {
  for (const rule of Object.keys(layer.lintOverrides ?? {})) {
    if (MANAGED_RULES.includes(rule)) {
      throw new Error(
        `Layer "${layer.name}" may not override "${rule}" — it is managed by the Enforce emitter.`,
      );
    }
  }
}

/** Normalize a rule setting to its tier string. */
function resolveTier(setting: RuleSetting): string {
  return typeof setting === 'string' ? setting : setting?.tier;
}
