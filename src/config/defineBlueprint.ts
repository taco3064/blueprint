import type {
  AgentEmitEntry,
  AgentTarget,
  ArchitectureDef,
  Blueprint,
  LayerDef,
  ModuleDef,
  OwnedPrimitive,
  RuleSetting,
} from './types';
import { normalizeAllowedImporters } from './graph';
import { activeSetting } from './settings';

const VALID_TIERS = ['error', 'warn', 'off'];
const LAYER_PLACEHOLDER = /\{\s*layer\s*\}/;
const MODULE_PLACEHOLDER = /\{\s*module\s*\}/;

// A declared name becomes a folder and a substituted glob segment in both
// namespaces, so both reject the same characters. The sentences differ because
// what the reader should do about it differs; these two classes must not.
const GLOB_OR_PATH_CHARS = /[*?{}[\]\\/]/;
const ARTIFACT_BREAKING_CHARS = /[\s"'()<>|;%&]/;

const AGENT_TARGETS = ['claude', 'agents', 'gemini', 'copilot', 'cursor', 'windsurf'];
const DEFAULT_AGENT_TARGETS: AgentTarget[] = ['claude', 'agents'];

/**
 * `architecture.module` was removed in 4.0.0, so the generic "nothing reads it"
 * answer would be true and useless — the shape did not disappear, it moved.
 * The last clause is the one adopters miss: this edit is not opt-in with the
 * modular model, it is the only way a 3.x config loads at all.
 */
const MODULE_FIELD_HINT
  = 'The module shape moved onto each layer in 4.0.0 — write `layout` / `entry` there instead: '
    + 'layers: [{ name: \'components\', does: \'…\', layout: \'folder\', entry: \'index\' }] '
    + '(entry defaults to "index", layout to "flat"). `private` is gone with no replacement: the '
    + 'entry-only ban already covers every non-entry file, so nothing was enforcing it. Every 3.x '
    + 'config must make this edit, including a flat project that is not adopting `modules`.';

/**
 * Keys a module entry attracts from the layer vocabulary next door. Each names
 * where the thing actually lives, because "unknown key" on a concept that does
 * exist — one level up or down — reads as "blueprint cannot express this".
 */
const LAYER_SHAPE_HINT
  = '`layout` / `entry` describe the unit shape inside a layer, not a module — declare them on '
    + 'the layer, inside `architecture.layers`.';

const MODULE_KEY_HINTS = {
  allowedImporters: 'Modules are isolated by default, so there is no permission to narrow: write '
    + 'the dependency as `imports` on the module that HAS it, not on the module it reaches.',
  layout: LAYER_SHAPE_HINT,
  entry: LAYER_SHAPE_HINT,
  mustNot: '`mustNot` is a layer\'s field. A module\'s boundary is its `imports` list, which is '
    + 'enforced; prose about what it must not do belongs in `does`.',
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
 *       { name: 'hooks', does: 'Adapts server and shared state', layout: 'folder' },
 *       { name: 'services', does: 'Network primitives', owns: ['axios', { global: 'fetch' }] },
 *     ],
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
  const { name, architecture, principles, rules } = bp;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw new Error('name must be a non-empty string when provided.');
  }

  rejectUnknownKeys(bp, ['name', 'framework', 'architecture', 'rules', 'principles', 'componentShape', 'playbook', 'emit'], 'the blueprint');

  if (!architecture || !Array.isArray(architecture.layers)) {
    throw new Error('architecture.layers must be an array.');
  }

  rejectUnknownKeys(
    architecture,
    ['alias', 'additionalAliases', 'sourceRoot', 'layers', 'modules', 'layerFiles', 'layerFilesIgnore', 'testFiles', 'naming'],
    'architecture',
    { module: MODULE_FIELD_HINT },
  );

  const { alias, additionalAliases, layers, layerFiles } = architecture;

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
    } else if (GLOB_OR_PATH_CHARS.test(layer.name)) {
      // A layer name is substituted into every file glob and scaffolded as a folder,
      // so a `*` name turns each net into a wildcard and creates a literal `src/*/`.
      // Root files are wiring; their lint belongs to the project's own eslint.
      throw new Error(
        `Layer "${layer.name}" contains glob or path characters — layer names become `
        + 'file globs and folders. Root files are wiring, not a layer: leave their '
        + 'hygiene to the project\'s own lint instead of widening the net.',
      );
    } else if (ARTIFACT_BREAKING_CHARS.test(layer.name)) {
      // The name also becomes a mermaid node id, where whitespace, quotes,
      // parens, `&` (node join), `%` (comment), and friends silently corrupt
      // the emitted diagram — fail loud here instead.
      throw new Error(
        `Layer "${layer.name}" contains characters that corrupt emitted artifacts — a `
        + 'layer name becomes a folder, a file glob, and a diagram node. Stick to '
        + 'letters, digits, ".", "_", "-".',
      );
    }

    rejectUnknownKeys(
      layer,
      ['name', 'does', 'mustNot', 'owns', 'layout', 'entry', 'allowedImporters', 'lintOverrides'],
      `layer "${layer.name}"`,
      {
        // The exact field shape: selfOnly on the layer validated fine, was
        // silently dead, and the intended re-export ban never emitted
        // (field issue #14). Point at the right home, not just "unknown".
        selfOnly: 'selfOnly lives on an allowedImporters ENTRY, naming the importing layer: '
          + 'allowedImporters: [{ layer: \'views\', selfOnly: true }]',
        module: MODULE_FIELD_HINT,
      },
    );

    validateOwns(layer, 'Layer');
    validateModuleShape(layer);
    validateLintOverrides(layer);
    // `names` holds only earlier layers here, so requiring importers to be in
    // it enforces "declared before" — which keeps the flow one-way and acyclic.
    validateAllowedImporters(layer, names);
    names.add(layer.name);
  }

  if (bp.emit !== undefined) {
    rejectUnknownKeys(bp.emit, ['handbook', 'agents', 'lint'], 'emit');

    if (bp.emit.lint !== undefined) {
      rejectUnknownKeys(bp.emit.lint, ['severity'], 'emit.lint');
    }

    if (bp.emit.agents) {
      for (const entry of bp.emit.agents) {
        if (typeof entry !== 'string') {
          rejectUnknownKeys(entry, ['target', 'path'], 'an emit.agents entry');
        }
      }
    }
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

    validateModuleGlob(glob, architecture);
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

  validateModules(architecture);
  validateUsePrefix(bp);
  validateAgentEmit(bp);

  return bp;
}

/** `usePrefix` must target a declared layer (default `hooks`) — unless it is off. */
function validateUsePrefix(bp: Blueprint): void {
  // A rule that never emits has no target to validate (field batch 8). No separate
  // `undefined` guard: `activeSetting` answers null for an absent setting too.
  const read = activeSetting(bp.rules?.usePrefix);

  if (read === null) return;

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

/** Validate a layer's `owns` list — each entry is a package, global, or shorthand. */
/**
 * A key the schema does not know is a silently dead declaration — the author
 * believes a constraint is active while nothing compiles from it (field issue #14).
 * Fail loud, and point misplaced keys home.
 */
function rejectUnknownKeys(
  value: object,
  allowed: string[],
  where: string,
  hints: Record<string, string> = {},
): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;

    throw new Error(
      `Unknown key "${key}" in ${where} — nothing reads it, so the declaration is `
      + `silently dead. ${hints[key] ?? `Expected keys: ${allowed.join(', ')}.`}`,
    );
  }
}

function validateOwns(owner: { name: string; owns?: OwnedPrimitive[] }, kind: 'Layer' | 'Module'): void {
  if (!owner.owns) return;

  const where = `${kind.toLowerCase()} "${owner.name}"`;

  for (const primitive of owner.owns) {
    if (typeof primitive === 'string') {
      if (!primitive.trim()) {
        throw new Error(`${kind} "${owner.name}" owns an empty package name.`);
      }
    } else if ('global' in primitive) {
      if (typeof primitive.global !== 'string' || !primitive.global.trim()) {
        throw new Error(`${kind} "${owner.name}" owns a global with no name.`);
      }

      rejectUnknownKeys(primitive, ['global'], `${where} owns entry "${primitive.global}"`);
    } else if (typeof primitive.package !== 'string' || !primitive.package.trim()) {
      throw new Error(`${kind} "${owner.name}" owns a package with no name.`);
    } else {
      rejectUnknownKeys(primitive, ['package', 'imports', 'pattern', 'exempt'], `${where} owns entry "${primitive.package}"`);
    }
  }
}

/**
 * The identity a ban is emitted for. Two entries with the same key reach the
 * same primitive however differently they are spelled, which is what makes a
 * module and a layer claiming it a conflict rather than two facts.
 */
function ownedKey(primitive: OwnedPrimitive): string {
  if (typeof primitive === 'string') return `package:${primitive}`;

  return 'global' in primitive ? `global:${primitive.global}` : `package:${primitive.package}`;
}

/** `axios` / global `fetch` — how an owned primitive is named in a message. */
function ownedLabel(primitive: OwnedPrimitive): string {
  if (typeof primitive === 'string') return `\`${primitive}\``;

  return 'global' in primitive ? `global \`${primitive.global}\`` : `\`${primitive.package}\``;
}

/**
 * A custom `layerFiles` glob against the declared shape. Both directions are
 * rejected, because both produce a glob that matches nothing and reports as a
 * clean net — the tool's own definition of a silently dead declaration.
 *
 * The topology is fixed rather than merely required: `{module}` first under
 * the source root, `{layer}` immediately after. Modules do not nest and the
 * module root is resolved from `sourceRoot` plus the name, so a pattern that
 * puts a segment between the two would leave the root and its own layers in
 * different trees.
 */
function validateModuleGlob(glob: string, architecture: ArchitectureDef): void {
  const segments = glob.split('/');
  const moduleAt = segments.findIndex((segment) => MODULE_PLACEHOLDER.test(segment));

  if (architecture.modules === undefined) {
    if (moduleAt === -1) return;

    throw new Error(
      `layerFiles entry "${glob}" carries a "{module}" placeholder, but architecture.modules is `
      + 'not declared — nothing would substitute it, so the glob would look for a directory '
      + 'literally named "{module}" and match no file. Declare the modules, or drop the placeholder.',
    );
  }

  if (moduleAt === -1) {
    throw new Error(
      `architecture.layerFiles must include "{module}" when architecture.modules is declared — `
      + `"${glob}" reads as "layers at the source root", which is not this project's shape. `
      + 'The one legal topology is <sourceRoot>/{module}/{layer}/…',
    );
  }

  const rootDepth = (architecture.sourceRoot ?? 'src') === '.'
    ? 0
    : (architecture.sourceRoot ?? 'src').split('/').length;

  const layerAt = segments.findIndex((segment) => LAYER_PLACEHOLDER.test(segment));

  if (moduleAt !== rootDepth || layerAt !== moduleAt + 1) {
    throw new Error(
      `layerFiles entry "${glob}" puts the module segment in the wrong place — "{module}" must be `
      + 'the first segment under the source root and "{layer}" must follow it immediately. '
      + 'A segment between them, or the two inverted, describes a tree blueprint cannot scan: '
      + 'depth is fixed at <sourceRoot>/{module}/{layer}/<unit>, and modules do not nest.',
    );
  }
}

/**
 * The declared modules: names that survive becoming folders and globs, and
 * `imports` edges that point forward into the declared set.
 */
function validateModules(architecture: ArchitectureDef): void {
  const { modules, layers } = architecture;

  if (modules === undefined) return;

  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error(
      'architecture.modules must be a non-empty array when declared — omit it entirely for the '
      + 'flat model, where `src/` is the single implicit module. Declared and empty, the '
      + 'module × layer glob product is empty too, so every file would sit outside every net.',
    );
  }

  const declared = new Set<string>();
  const folded = new Map<string, string>();

  for (const module of modules) {
    validateModuleName(module, declared, folded);
    rejectUnknownKeys(module, ['name', 'does', 'imports', 'layers', 'owns'], `module "${module.name}"`, MODULE_KEY_HINTS);

    if (module.layers !== undefined && module.layers !== false) {
      throw new Error(
        `Module "${module.name}" has layers ${JSON.stringify(module.layers)} — the only value is `
        + 'false, which opts out of the inner layer vocabulary. Omit the key for a layered module.',
      );
    }

    validateOwns(module, 'Module');
    declared.add(module.name);
    folded.set(module.name.toLowerCase(), module.name);
  }

  validateModuleImports(modules);
  validateOwnershipIsSingular(modules, layers);
}

/** A module name has to survive becoming a folder, a glob, and a diagram node. */
function validateModuleName(
  module: ModuleDef,
  declared: Set<string>,
  folded: Map<string, string>,
): void {
  if (typeof module?.name !== 'string' || !module.name.trim()) {
    throw new Error('Each module must have a non-empty name.');
  } else if (declared.has(module.name)) {
    throw new Error(`Duplicate module name: "${module.name}".`);
  } else if (folded.has(module.name.toLowerCase())) {
    // Two entries on Linux, one folder on macOS: the config would validate on
    // the author's machine and the second module's files would land in the
    // first module's net — governed by rules nobody wrote for them.
    throw new Error(
      `Modules "${folded.get(module.name.toLowerCase())}" and "${module.name}" differ only in case `
      + '— they are two entries here and one folder on a case-insensitive filesystem. Rename one.',
    );
  } else if (GLOB_OR_PATH_CHARS.test(module.name)) {
    throw new Error(
      `Module "${module.name}" contains glob or path characters — a module name becomes a folder `
      + 'under the source root and a segment of every glob built for it. Modules do not nest: a '
      + 'name is one segment, never a path.',
    );
  } else if (ARTIFACT_BREAKING_CHARS.test(module.name)) {
    throw new Error(
      `Module "${module.name}" contains characters that corrupt emitted artifacts — a module name `
      + 'becomes a folder, a file glob, and a diagram node. Stick to letters, digits, ".", "_", "-".',
    );
  }
}

/**
 * Each `imports` entry names a distinct module declared LATER. Validated
 * against the complete set, not a growing one: forward is the legal direction
 * here, which is the mirror image of `allowedImporters` next door — do not read
 * that implementation as the model for this one.
 */
function validateModuleImports(modules: ModuleDef[]): void {
  // One map answers both questions — declared at all, and declared where.
  // Two structures over the same names could disagree; this one cannot.
  const position = new Map(modules.map((module, index) => [module.name, index]));

  modules.forEach((module, index) => {
    if (module.imports === undefined) return;

    if (!Array.isArray(module.imports)) {
      throw new Error(`Module "${module.name}" has a non-array imports — omit it to depend on nothing.`);
    }

    const seen = new Set<string>();

    for (const name of module.imports) {
      // One lookup, so "is it declared" and "declared where" cannot disagree:
      // an absent position IS an undeclared module.
      // undecidable, the string guard: a non-string name is rejected by the
      // first arm below before its position is ever read, so looking one up
      // for it would change nothing.
      const target = typeof name === 'string' ? position.get(name) : undefined;

      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`Module "${module.name}" imports an entry with no module name.`);
      } else if (name === module.name) {
        throw new Error(`Module "${module.name}" cannot import itself.`);
      } else if (target === undefined) {
        throw new Error(
          `Module "${module.name}" imports "${name}", which is not a declared module.`,
        );
      // undecidable, the comparison: `target === index` is the module naming
      // itself, which the self-reference arm above already rejected.
      } else if (target < index) {
        // The acyclicity guarantee: the graph is one-way by construction, so no
        // cycle check exists downstream to catch a backward edge later.
        throw new Error(
          `Module "${module.name}" imports "${name}", which is declared before it — a module may `
          + 'only name modules declared after itself, which is what keeps the flow one-way. '
          + 'Reorder the two, or the dependency runs the other way.',
        );
      } else if (seen.has(name)) {
        throw new Error(`Module "${module.name}" imports "${name}" more than once.`);
      }

      seen.add(name);
    }
  });
}

/**
 * A primitive has one owner. Two owners have three defensible readings and the
 * intersection is what two independent ban emitters would produce by accident,
 * so this is rejected rather than resolved downstream. Loosening later is
 * additive; tightening would not be.
 */
function validateOwnershipIsSingular(modules: ModuleDef[], layers: LayerDef[]): void {
  // undecidable, both `?? []` arms: a fabricated member is a string, which
  // `ownedKey` reads as a package name. It keys an entry no real declaration
  // shares, so the conflict test below can never match it.
  const byLayers = new Map<string, string[]>();

  for (const layer of layers) {
    for (const primitive of layer.owns ?? []) {
      byLayers.set(ownedKey(primitive), [...(byLayers.get(ownedKey(primitive)) ?? []), layer.name]);
    }
  }

  for (const module of modules) {
    for (const primitive of module.owns ?? []) {
      const owners = byLayers.get(ownedKey(primitive));

      if (!owners) continue;

      throw new Error(
        `${ownedLabel(primitive)} is owned by module "${module.name}" and by `
        + `${owners.length > 1 ? 'layers' : 'layer'} ${owners.map((name) => `"${name}"`).join(', ')} `
        + '— a primitive has one owner. Two owners could mean the module may use it, that layer in '
        + 'every module may use it, or only their intersection; blueprint will not pick one. Keep '
        + 'the declaration on the scope the ban should follow and delete the other.',
      );
    }
  }
}

/** A layer's module shape: layout from the pair, entry a real filename. */
function validateModuleShape(layer: LayerDef): void {
  if (layer.layout !== undefined && !['folder', 'flat'].includes(layer.layout)) {
    throw new Error(
      `Layer "${layer.name}" has layout "${layer.layout}" — expected folder | flat, or omit it `
      + 'for the default (flat).',
    );
  }

  if (layer.entry !== undefined && (typeof layer.entry !== 'string' || !layer.entry.trim())) {
    throw new Error(
      `Layer "${layer.name}" has an empty entry — omit it for the default ("index").`,
    );
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
