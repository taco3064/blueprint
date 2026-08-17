import type {
  AgentEmitEntry,
  AgentTarget,
  ArchitectureDef,
  Blueprint,
  EmitDef,
  FolderDef,
  LayerDef,
  RuleSetting,
} from './types';
import { normalizeAllowedImporters } from './graph';
import { validateModules } from './modules';
import { activeSetting } from './settings';
import { rejectUnknownKeys, validateOwns } from './validate';

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
  'modules',
  'folder',
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
  'folder',
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
 *     folder: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
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

  return bp;
}

/** `name` is optional, but an empty one is a typo rather than a choice. */
function validateName(name: string | undefined): void {
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw new Error('name must be a non-empty string when provided.');
  }
}

/** The architecture block: its own keys, then each part that has its own rules. */
function validateArchitecture(architecture: ArchitectureDef | undefined): void {
  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  rejectUnknownKeys(architecture, ARCHITECTURE_KEYS, 'architecture');

  const { alias, additionalAliases, layers, folder, layerFiles } = architecture;

  if (typeof alias !== 'string' || !alias.trim()) {
    throw new Error('architecture.alias must be a non-empty string.');
  }

  if (layers.length === 0) {
    throw new Error('architecture.layers must not be empty.');
  }

  validateLayers(layers);
  validateModules(architecture.modules);
  validateFolder(folder);
  validateAdditionalAliases(additionalAliases);
  validateLayerFiles(layerFiles);
}

/** Each layer in declaration order — the order the "declared before" rule reads. */
function validateLayers(layers: LayerDef[]): void {
  const names = new Set<string>();

  for (const layer of layers) {
    validateLayerName(layer, names);
    rejectUnknownKeys(layer, LAYER_KEYS, `layer "${layer.name}"`);
    validateOwns(layer);
    validateLayerFolder(layer);
    validateLintOverrides(layer);
    // `names` holds only earlier layers here, so requiring importers to be in
    // it enforces "declared before" — which keeps the flow one-way and acyclic.
    validateAllowedImporters(layer, names);
    names.add(layer.name);
  }
}

/** A layer name becomes a folder, a file glob, and a diagram node id. */
function validateLayerName(layer: LayerDef, earlier: Set<string>): void {
  if (typeof layer?.name !== 'string' || !layer.name.trim()) {
    throw new Error('Each layer must have a non-empty name.');
  } else if (earlier.has(layer.name)) {
    throw new Error(`Duplicate layer name: "${layer.name}".`);
  } else if (/[*?{}[\]\\/]/.test(layer.name)) {
    // A layer name is substituted into every file glob and scaffolded as a folder,
    // so a `*` name turns each net into a wildcard and creates a literal `src/*/`.
    // Root files are wiring; their lint belongs to the project's own eslint.
    throw new Error(
      `Layer "${layer.name}" contains glob or path characters — layer names become `
      + 'file globs and folders. Root files are wiring, not a layer: leave their '
      + 'hygiene to the project\'s own lint instead of widening the net.',
    );
  } else if (/[\s"'()<>|;%&]/.test(layer.name)) {
    // Whitespace, quotes, parens, `&` (node join), `%` (comment), and friends
    // silently corrupt the emitted diagram — fail loud here instead.
    throw new Error(
      `Layer "${layer.name}" contains characters that corrupt emitted artifacts `
      + '— a layer name becomes a folder, a file glob, and a diagram node. '
      + 'Stick to letters, digits, ".", "_", "-".',
    );
  }
}

/**
 * Optional in whole: the flat default is applied at read time, so a config that
 * never mentions `folder` is complete (field issue #23).
 */
function validateFolder(folder: FolderDef | undefined): void {
  if (folder === undefined) {
    return;
  }

  if (folder.layout !== undefined && folder.layout !== 'folder' && folder.layout !== 'flat') {
    throw new Error(
      `architecture.folder.layout is "${String(folder.layout)}" — expected folder | flat, `
      + 'or omit it for the default (flat).',
    );
  }

  if (folder.entry !== undefined && (typeof folder.entry !== 'string' || !folder.entry.trim())) {
    throw new Error(
      'architecture.folder.entry must be a non-empty string when set '
      + '— omit it for the default ("index").',
    );
  }

  if (folder.private !== undefined && !Array.isArray(folder.private)) {
    throw new Error('architecture.folder.private must be an array when set — omit it for none.');
  }

  rejectUnknownKeys(folder, ['layout', 'entry', 'private'], 'architecture.folder');
}

/** Every extra alias maps a non-empty name to a non-empty target. */
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

/** A layer glob with no `{layer}` in it matches one fixed path for every layer. */
function validateLayerFiles(layerFiles: string | string[] | undefined): void {
  const globs = layerFiles === undefined ? [] : [layerFiles].flat();

  for (const glob of globs) {
    if (!LAYER_PLACEHOLDER.test(glob)) {
      throw new Error(`layerFiles entry "${glob}" must include the "{layer}" placeholder.`);
    }
  }
}

/** The `emit` block and each agents entry inside it. */
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

/** Every entry needs a non-empty id, and no two entries may share one. */
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

/** Titled sections whose rule ids are unique across the whole playbook. */
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

/** Every declared rule carries one of the three tiers. */
function validateRuleTiers(rules: Blueprint['rules']): void {
  for (const [id, setting] of Object.entries(rules ?? {})) {
    if (!VALID_TIERS.includes(resolveTier(setting))) {
      throw new Error(`Rule "${id}" has an invalid tier — expected error | warn | off.`);
    }
  }
}

/** `usePrefix` must target a declared layer (default `hooks`) — unless it is off. */
function validateUsePrefix(bp: Blueprint): void {
  // A rule that never emits has no target to validate (field batch 8). No separate
  // `undefined` guard: `activeSetting` answers null for an absent setting too.
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

/**
 * Normalize the mixed `emit.agents` list. An explicit config always wins;
 * `defaultTargets` replaces the built-in default (`claude` + `agents`) when
 * the config is silent — e.g. `init --agent claude` narrows to the one tool
 * actually in use.
 * @internal
 */
export function normalizeAgentEmit(
  agents: (AgentTarget | AgentEmitEntry)[] | undefined,
  defaultTargets?: AgentTarget[],
): AgentEmitEntry[] {
  return (agents ?? defaultTargets ?? DEFAULT_AGENT_TARGETS).map((entry) =>
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

/** A layer's `folder` override may only narrow layout / entry, both well-formed. */
function validateLayerFolder(layer: LayerDef): void {
  const override = layer.folder;

  if (override === undefined) {
    return;
  }

  rejectUnknownKeys(override, ['layout', 'entry'], `layer "${layer.name}" folder override`);

  if (override.layout !== undefined && !['folder', 'flat'].includes(override.layout)) {
    throw new Error(
      `Layer "${layer.name}" has folder.layout "${override.layout}" — expected folder | flat.`,
    );
  }

  if (
    override.entry !== undefined
    && (typeof override.entry !== 'string' || !override.entry.trim())
  ) {
    throw new Error(`Layer "${layer.name}" has an empty folder.entry override.`);
  }
}

/** Each allowed importer must be a distinct layer declared before this one. */
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

/**
 * Normalize a rule setting to its tier string. Not `readSetting`: this runs during
 * validation, where the setting is whatever a hand-written config put there —
 * including null, which the optional chain turns into a precise error rather than a
 * property crash.
 */
function resolveTier(setting: RuleSetting): string {
  return typeof setting === 'string' ? setting : setting?.tier;
}
