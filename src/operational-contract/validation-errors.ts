import {
  ConfigValidationError,
  defineBlueprint as defineDomainBlueprint,
  validateBlueprint as validateDomainBlueprint,
} from '../config';
import type { Blueprint, ConfigValidationFact } from '../config';
import { MarkdownValidationError } from '../markdown';
import type { MarkdownValidationFact } from '../markdown';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type ValidationErrorFact = ConfigValidationFact | MarkdownValidationFact;

type ErrorRendererMap = {
  [Kind in ValidationErrorFact['kind']]: (
    fact: Extract<ValidationErrorFact, { kind: Kind }>,
  ) => string;
};

const renderers = {
  'blueprint-name': () => 'name must be a non-empty string when provided.',
  'architecture-layers-array': () => 'architecture.layers must be an array.',
  'architecture-alias': () => 'architecture.alias must be a non-empty string.',
  'architecture-layers-empty': () => 'architecture.layers must not be empty.',
  'layer-name-empty': () => 'Each layer must have a non-empty name.',
  'duplicate-layer': (fact) => `Duplicate layer name: "${fact.name}".`,
  'layer-name-path': (fact) =>
    `Layer "${fact.name}" contains glob or path characters — layer names become `
    + 'file globs and folders. Root files are wiring, not a layer: leave their '
    + 'hygiene to the project\'s own lint instead of widening the net.',
  'layer-name-artifact': (fact) =>
    `Layer "${fact.name}" contains characters that corrupt emitted artifacts `
    + '— a layer name becomes a folder, a file glob, and a diagram node. '
    + 'Stick to letters, digits, ".", "_", "-".',
  'modules-empty': () => 'architecture.modules must be an array when set; [] selects a '
    + 'module-first runway with no instantiated domains.',
  'module-does': (fact) => `Module "${fact.module}" must have a non-empty does.`,
  'module-case-collision': (fact) =>
    `Module names "${fact.first}" and "${fact.second}" map to the same source-root folder `
    + 'on case-insensitive filesystems.',
  'module-depends-array': (fact) =>
    `Module "${fact.module}" dependsOn must be an array of module names.`,
  'additional-aliases': () =>
    'architecture.additionalAliases must map non-empty strings to non-empty strings.',
  'canonical-alias-collision': (fact) =>
    `Canonical alias "${fact.alias}" targets "${fact.canonical}" but additionalAliases maps the `
    + `same identity to "${fact.additional}". Remove the duplicate or use the same normalised target.`,
  'layer-files-layer': (fact) =>
    `layerFiles entry "${fact.glob}" must include the "{layer}" placeholder.`,
  'module-layer-files': (fact) =>
    `Module-first layerFiles entry "${fact.glob}" must include both "{module}" and "{layer}" `
    + 'so repeated layers do not collapse into one global net.',
  'layer-layer-files': (fact) =>
    `Layer-first layerFiles entry "${fact.glob}" must not include "{module}" — `
    + 'declare architecture.modules to open the module dimension, or remove the placeholder.',
  'id-empty': (fact) => `Each ${fact.subject} must have a non-empty id.`,
  'duplicate-id': (fact) => `Duplicate ${fact.subject} id: "${fact.id}".`,
  'playbook-title': () => 'Each playbook section must have a non-empty title.',
  'playbook-rule-id': (fact) => `Playbook section "${fact.title}" has a rule with no id.`,
  'duplicate-playbook-rule': (fact) => `Duplicate playbook rule id: "${fact.id}".`,
  'invalid-tier': (fact) =>
    `Rule "${fact.id}" has an invalid tier — expected error | warn | off.`,
  'use-prefix-layer': (fact) =>
    `Rule "usePrefix" targets layer "${fact.layer}", which is not a declared layer — `
    + 'set its "layer" option.',
  'unknown-agent': (fact) =>
    `emit.agents target "${fact.target}" is unknown — expected ${fact.expected.join(' | ')}.`,
  'duplicate-agent': (fact) =>
    `emit.agents lists target "${fact.target}" more than once.`,
  'agent-path': (fact) => `emit.agents target "${fact.target}" has an empty path.`,
  'unknown-key': (fact) =>
    `Unknown key "${fact.key}" in ${fact.where} — nothing reads it, so the declaration is `
    + `silently dead. ${fact.key === 'selfOnly'
      ? 'selfOnly lives on an allowedImporters ENTRY, naming the importing layer: '
      + 'allowedImporters: [{ layer: \'views\', selfOnly: true }]'
      : `Expected keys: ${fact.allowed.join(', ')}.`}`,
  'owned-package-string': (fact) => `Layer "${fact.layer}" owns an empty package name.`,
  'owned-global': (fact) => `Layer "${fact.layer}" owns a global with no name.`,
  'owned-package-object': (fact) => `Layer "${fact.layer}" owns a package with no name.`,
  'retired-flat': (fact) =>
    `Layer "${fact.layer}" uses retired layout "flat" — Blueprint 4.0 calls the one-file `
    + 'unit layout "file". Use layout: "file" or omit it for that default.',
  'invalid-layout': (fact) =>
    `Layer "${fact.layer}" has layout "${fact.layout}" — expected folder | file.`,
  'empty-entry': (fact) => `Layer "${fact.layer}" has an empty entry.`,
  'retired-architecture-module': () =>
    'architecture.module is retired in Blueprint 4.0 — move layout and entry onto each '
    + 'layer. module.private was removed without replacement; the inner concept is now a unit.',
  'retired-layer-module': (fact) =>
    `layers[].module is retired in Blueprint 4.0 (layer "${fact.layer}") — move layout and `
    + 'entry directly onto the layer; the inner concept is now a unit.',
  'architecture-name-empty': (fact) => `Each ${fact.subject} must have a non-empty name.`,
  'architecture-name-path': (fact) =>
    `${fact.title} "${fact.name}" contains glob or path characters.`,
  'architecture-name-artifact': (fact) =>
    `${fact.title} "${fact.name}" contains characters that corrupt paths or generated artifacts.`,
  'allowed-importer-empty': (fact) =>
    `Layer "${fact.layer}" has an allowedImporters entry with no layer.`,
  'self-importer': (fact) => `Layer "${fact.layer}" cannot list itself as an allowed importer.`,
  'unknown-importer': (fact) =>
    `Layer "${fact.layer}" allows importer "${fact.importer}", which is not a layer `
    + 'declared before it.',
  'duplicate-importer': (fact) =>
    `Layer "${fact.layer}" lists importer "${fact.importer}" more than once.`,
  'managed-rule': (fact) =>
    `Layer "${fact.layer}" may not override "${fact.rule}" — it is managed by the Enforce emitter.`,
  'module-dependency-empty': (fact) =>
    `Module "${fact.module}" has a dependsOn entry with no module name.`,
  'module-self-dependency': (fact) => `Module "${fact.module}" cannot depend on itself.`,
  'module-duplicate-dependency': (fact) =>
    `Module "${fact.module}" lists direct dependency "${fact.dependency}" more than once.`,
  'module-unknown-dependency': (fact) =>
    `Module "${fact.module}" depends on unknown module "${fact.dependency}" — `
    + 'declare that module in architecture.modules or remove the edge.',
  'module-cycle': (fact) => `architecture.modules dependency cycle: ${fact.path.join(' → ')}.`,
  'legacy-shape': (fact) => `${fact.where} must be an object when set.`,
  'legacy-key': (fact) =>
    `Unknown key "${fact.key}" in ${fact.where}. Expected keys: ${fact.allowed.join(', ')}.`,
  'legacy-private': () =>
    'architecture.module.private must be an array when set — omit it for none.',
  'markdown-markers': (fact) =>
    `Markers "${fact.start}" / "${fact.end}" not found (or out of order) in source.`,
} satisfies ErrorRendererMap;

export function renderValidationError(fact: ValidationErrorFact): OperationalText {
  const render = renderers[fact.kind] as (input: ValidationErrorFact) => string;

  return operationalText(render(fact));
}

export function renderValidationErrorCause(error: unknown): string {
  if (error instanceof ConfigValidationError || error instanceof MarkdownValidationError) {
    return renderValidationError(error.fact);
  }

  return error instanceof Error ? error.message : String(error);
}

export function withValidationErrorRendering<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ConfigValidationError || error instanceof MarkdownValidationError) {
      throw new Error(renderValidationError(error.fact));
    }

    throw error;
  }
}

/**
 * Author a Blueprint. Validates referential integrity up front and returns a
 * current config unchanged. A supported 3.2 layer shape is normalized to its
 * equivalent 4.0 layer fields for the upgrade path.
 *
 * @group Author
 * @example
 * export default defineBlueprint({
 *   framework: 'auto',
 *   architecture: {
 *     alias: '~app',
 *     layers: [
 *       { name: 'components', does: 'Reusable UI', layout: 'folder', entry: 'index' },
 *       { name: 'hooks', does: 'Adapts server and shared state', layout: 'file' },
 *       { name: 'services', does: 'Network primitives', owns: ['axios', { global: 'fetch' }] },
 *     ],
 *   },
 * });
 */
export function defineBlueprint(config: Blueprint): Blueprint {
  try {
    return defineDomainBlueprint(config);
  } catch (error) {
    throw new Error(renderValidationErrorCause(error));
  }
}

/**
 * Throws with a precise message if the blueprint is structurally invalid;
 * returns it unchanged otherwise.
 * @group Author
 */
export function validateBlueprint(blueprint: Blueprint): Blueprint {
  try {
    return validateDomainBlueprint(blueprint);
  } catch (error) {
    throw new Error(renderValidationErrorCause(error));
  }
}
