export type ConfigValidationFact
  = | { kind: 'blueprint-name' }
    | {
      kind: 'invalid-framework';
      declared: boolean;
      framework?: string;
      expected: readonly string[];
    }
    | { kind: 'architecture-layers-array' }
    | { kind: 'architecture-alias' }
    | { kind: 'architecture-layers-empty' }
    | { kind: 'layer-name-empty' }
    | { kind: 'duplicate-layer'; name: string }
    | { kind: 'layer-name-path'; name: string }
    | { kind: 'layer-name-artifact'; name: string }
    | { kind: 'layer-does'; layer: string }
    | { kind: 'modules-empty' }
    | { kind: 'module-does'; module: string }
    | { kind: 'module-case-collision'; first: string; second: string }
    | { kind: 'module-depends-array'; module: string }
    | { kind: 'additional-aliases' }
    | { kind: 'canonical-alias-collision'; alias: string; canonical: string; additional: string }
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
    | { kind: 'legacy-private' };

export class ConfigValidationError extends Error {
  readonly name = 'ConfigValidationError';
  readonly fact: ConfigValidationFact;

  constructor(fact: ConfigValidationFact) {
    super();
    this.fact = fact;
  }
}

export function configValidationError(fact: ConfigValidationFact): ConfigValidationError {
  return new ConfigValidationError(fact);
}
