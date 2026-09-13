import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type ValidationErrorFact
  = | { kind: 'blueprint-name' }
    | { kind: 'architecture-layers-array' }
    | { kind: 'architecture-alias' }
    | { kind: 'architecture-layers-empty' }
    | { kind: 'layer-name-empty' }
    | { kind: 'duplicate-layer'; name: string }
    | { kind: 'layer-name-path'; name: string }
    | { kind: 'layer-name-artifact'; name: string }
    | { kind: 'modules-empty' }
    | { kind: 'module-does'; module: string }
    | { kind: 'module-case-collision'; first: string; second: string }
    | { kind: 'module-depends-array'; module: string }
    | { kind: 'additional-aliases' }
    | { kind: 'layer-files-layer'; glob: string }
    | { kind: 'module-layer-files'; glob: string }
    | { kind: 'layer-layer-files'; glob: string }
    | { kind: 'id-empty'; subject: string }
    | { kind: 'duplicate-id'; subject: string; id: string }
    | { kind: 'playbook-title' }
    | { kind: 'playbook-rule-id'; title: string }
    | { kind: 'duplicate-playbook-rule'; id: string }
    | { kind: 'invalid-tier'; id: string }
    | { kind: 'use-prefix-layer'; layer: string }
    | { kind: 'unknown-agent'; target: string; expected: readonly string[] }
    | { kind: 'duplicate-agent'; target: string }
    | { kind: 'agent-path'; target: string }
    | { kind: 'unknown-key'; key: string; where: string; allowed: readonly string[] }
    | { kind: 'owned-package-string'; layer: string }
    | { kind: 'owned-global'; layer: string }
    | { kind: 'owned-package-object'; layer: string }
    | { kind: 'retired-flat'; layer: string }
    | { kind: 'invalid-layout'; layer: string; layout: string }
    | { kind: 'empty-entry'; layer: string }
    | { kind: 'retired-architecture-module' }
    | { kind: 'retired-layer-module'; layer: string }
    | { kind: 'architecture-name-empty'; subject: 'module' | 'layer' }
    | { kind: 'architecture-name-path'; title: string; name: string }
    | { kind: 'architecture-name-artifact'; title: string; name: string }
    | { kind: 'allowed-importer-empty'; layer: string }
    | { kind: 'self-importer'; layer: string }
    | { kind: 'unknown-importer'; layer: string; importer: string }
    | { kind: 'duplicate-importer'; layer: string; importer: string }
    | { kind: 'managed-rule'; layer: string; rule: string }
    | { kind: 'module-dependency-empty'; module: string }
    | { kind: 'module-self-dependency'; module: string }
    | { kind: 'module-duplicate-dependency'; module: string; dependency: string }
    | { kind: 'module-unknown-dependency'; module: string; dependency: string }
    | { kind: 'module-cycle'; path: readonly string[] }
    | { kind: 'legacy-shape'; where: string }
    | { kind: 'legacy-key'; key: string; where: string; allowed: readonly string[] }
    | { kind: 'legacy-private' }
    | { kind: 'markdown-markers'; start: string; end: string };

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
  'modules-empty': () => 'architecture.modules must be a non-empty array when set.',
  'module-does': (fact) => `Module "${fact.module}" must have a non-empty does.`,
  'module-case-collision': (fact) =>
    `Module names "${fact.first}" and "${fact.second}" map to the same source-root folder `
    + 'on case-insensitive filesystems.',
  'module-depends-array': (fact) =>
    `Module "${fact.module}" dependsOn must be an array of module names.`,
  'additional-aliases': () =>
    'architecture.additionalAliases must map non-empty strings to non-empty strings.',
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
