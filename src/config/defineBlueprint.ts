import type { Blueprint, LayerDef, RuleSetting } from './types';
import { deriveEdges, detectCycle, normalizeExtraEdges } from './graph';

const VALID_TIERS = ['error', 'warn', 'off'];
const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/;

const MANAGED_RULES = [
  'no-restricted-imports',
  'no-restricted-syntax',
  'no-restricted-globals',
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
  const { architecture, principles, rules } = bp;

  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  const { alias, additionalAliases, layers, extraEdges, module, layerFiles } =
    architecture;

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
    validateLintOverrides(layer);
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
      typeof additionalAliases !== 'object' ||
      entries.some(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim())
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

  // normalizeExtraEdges throws on a malformed "from⇢to" string.
  for (const { from, to } of normalizeExtraEdges(extraEdges)) {
    if (!names.has(from)) {
      throw new Error(`extraEdge references unknown layer "${from}".`);
    } else if (!names.has(to)) {
      throw new Error(`extraEdge references unknown layer "${to}".`);
    }
  }

  const cycle = detectCycle(deriveEdges(architecture));

  if (cycle) {
    throw new Error(`architecture has a dependency cycle: ${cycle.join(' → ')}.`);
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

  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw new Error(`Rule "${id}" has an invalid tier — expected error | warn | off.`);
    }
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
