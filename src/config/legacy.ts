import type { ArchitectureDef, Blueprint, LayerDef } from './types';

interface LegacyUnitShape {
  layout?: 'folder' | 'flat';
  entry?: string;
  private?: string[];
}

type LegacyLayer = LayerDef & { module?: LegacyUnitShape };
type LegacyArchitecture = ArchitectureDef & {
  module?: LegacyUnitShape;
  layers: LegacyLayer[];
};

const legacyMigration = Symbol.for('@kekkai/blueprint/legacy-migration');

/** @internal */
export function migrateLegacyBlueprint(
  blueprint: Blueprint,
): { blueprint: Blueprint; migrated: boolean } {
  const architecture = blueprint.architecture as LegacyArchitecture | undefined;

  if (!isLegacyArchitecture(architecture)) {
    return { blueprint, migrated: false };
  }

  const shared = architecture.module ?? {};
  const currentArchitecture = { ...architecture };

  if (architecture.module !== undefined) {
    validateLegacyUnitShape(
      architecture.module, ['layout', 'entry', 'private'], 'architecture.module',
    );
  }

  delete currentArchitecture.module;
  const layers = architecture.layers.map((layer) => migrateLayer(layer, shared));

  const migrated = { ...blueprint, architecture: { ...currentArchitecture, layers } };

  Object.defineProperty(migrated, legacyMigration, { value: true });

  return { blueprint: migrated, migrated: true };
}

/** @internal */
export function isLegacyBlueprintMigration(blueprint: Blueprint): boolean {
  return (blueprint as Blueprint & { [legacyMigration]?: boolean })[legacyMigration] === true;
}

/** @internal */
export function migratedConfigSource(blueprint: Blueprint): string {
  return [
    `export default ${JSON.stringify(blueprint, null, 2)};`,
    '',
  ].join('\n');
}

function isLegacyArchitecture(
  architecture: LegacyArchitecture | undefined,
): architecture is LegacyArchitecture {
  if (!architecture || !Array.isArray(architecture.layers)) {
    return false;
  }

  for (const layer of architecture.layers) {
    if (typeof layer !== 'object' || layer === null) {
      return false;
    }
  }

  const hasCurrentShape = 'modules' in architecture
    || architecture.layers.some((layer) => 'layout' in layer || 'entry' in layer);

  return !hasCurrentShape && (
    'module' in architecture
    || architecture.layers.some((layer) => 'module' in layer)
  );
}

function migrateLayer(layer: LegacyLayer, shared: LegacyUnitShape): LayerDef {
  const { module: override, ...currentLayer } = layer;

  if (override !== undefined) {
    validateLegacyUnitShape(override, ['layout', 'entry'], `layer "${layer.name}" module override`);
  }

  const legacyLayout = override?.layout ?? shared.layout ?? 'flat';

  return {
    ...currentLayer,
    layout: legacyLayout === 'flat' ? 'file' : legacyLayout,
    entry: override?.entry ?? shared.entry ?? 'index',
  };
}

function validateLegacyUnitShape(
  shape: unknown,
  allowed: string[],
  where: string,
): void {
  if (typeof shape !== 'object' || shape === null || Array.isArray(shape)) {
    throw new Error(`${where} must be an object when set.`);
  }

  for (const key of Object.keys(shape)) {
    if (!allowed.includes(key)) {
      throw new Error(`Unknown key "${key}" in ${where}. Expected keys: ${allowed.join(', ')}.`);
    }
  }

  const unit = shape as LegacyUnitShape;

  if (unit.private !== undefined && !Array.isArray(unit.private)) {
    throw new Error('architecture.module.private must be an array when set — omit it for none.');
  }
}
