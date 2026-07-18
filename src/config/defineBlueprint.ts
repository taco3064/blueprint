import type { Blueprint, RuleSetting } from './types';

/**
 * Author a Blueprint. Validates referential integrity up front, then returns
 * the config unchanged — the single source every emitter compiles from.
 *
 * @example
 * export default defineBlueprint({
 *   framework: 'auto',
 *   architecture: {
 *     layers: [
 *       { name: 'components', does: '可重用 UI', mustNot: ['import services'] },
 *       { name: 'hooks', does: 'inject / 加工 state' },
 *       { name: 'services', does: '網路原件', owns: ['axios', 'fetch'] },
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

const EDGE_SEP = /\s*(?:⇢|→|->)\s*/;
const VALID_TIERS = ['error', 'warn', 'off'];

/** Throws with a precise message if the blueprint is structurally invalid. */
export function validateBlueprint(bp: Blueprint): void {
  const { architecture, principles, rules } = bp;

  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  const { layers, extraEdges, module } = architecture;

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

    names.add(layer.name);
  }

  if (!module || typeof module.entry !== 'string' || !module.entry.trim()) {
    throw new Error('architecture.module.entry must be a non-empty string.');
  } else if (!Array.isArray(module.private)) {
    throw new Error('architecture.module.private must be an array.');
  }

  for (const edge of extraEdges ?? []) {
    const [from, to, ...rest] = edge.split(EDGE_SEP);

    if (!from || !to || rest.length) {
      throw new Error(`Invalid extraEdge "${edge}" — expected "from⇢to".`);
    } else if (!names.has(from)) {
      throw new Error(`extraEdge "${edge}" references unknown layer "${from}".`);
    } else if (!names.has(to)) {
      throw new Error(`extraEdge "${edge}" references unknown layer "${to}".`);
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

  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw new Error(
        `Rule "${id}" has an invalid tier — expected error | warn | off.`,
      );
    }
  }
}

/** Normalize a rule setting to its tier string. */
function resolveTier(setting: RuleSetting): string {
  return typeof setting === 'string' ? setting : setting?.tier;
}
