import { getSharedFolder } from './graph';
import type { ArchitectureDef, ModuleAllowedImporter, ModuleDef } from './types';
import { rejectUnknownKeys, validateOwns } from './validate';

/**
 * Everything the config layer knows about feature modules — the block's own
 * validation, and the queries the emitters and both runtimes compile from.
 * Layer flow lives in `graph.ts`; this is the same shape one depth up, split
 * into its own satellite rather than grown inside `graph.ts` / `defineBlueprint.ts`
 * because both were already at this repo's own `maxLines` gate.
 */

const MODULE_KEYS = ['name', 'does', 'layers', 'owns', 'allowedImporters', 'entry'];

/**
 * The declared feature modules, or none at all for the flat structure.
 * @internal
 */
export function getModules(architecture: ArchitectureDef): ModuleDef[] {
  return architecture.modules ?? [];
}

/**
 * Normalize the mixed module `allowedImporters` list into objects — the
 * module-axis twin of `normalizeAllowedImporters`.
 * @internal
 */
export function normalizeModuleAllowedImporters(
  allowed: (string | ModuleAllowedImporter)[] | undefined,
): ModuleAllowedImporter[] {
  return (allowed ?? []).map((entry) =>
    typeof entry === 'string' ? { module: entry } : entry,
  );
}

/**
 * Names of modules permitted to import the module at `index`: its explicit
 * `allowedImporters` list, or — by default — every module declared before it.
 */
function moduleImporterNames(modules: ModuleDef[], index: number): string[] {
  const { allowedImporters } = modules[index];

  return allowedImporters
    ? normalizeModuleAllowedImporters(allowedImporters).map((importer) => importer.module)
    : modules.slice(0, index).map((module) => module.name);
}

/**
 * Modules `moduleName` may NOT import: every other module that does not list
 * `moduleName` among its permitted importers (upstream modules included) —
 * the module-axis twin of `getForbiddenLayers`.
 * @internal
 */
export function getForbiddenModules(architecture: ArchitectureDef, moduleName: string): string[] {
  const modules = getModules(architecture);

  return modules
    .filter(
      (module, index) =>
        module.name !== moduleName && !moduleImporterNames(modules, index).includes(moduleName),
    )
    .map((module) => module.name);
}

/**
 * Modules `moduleName` may import but must not re-export (selfOnly importers)
 * — the module-axis twin of `getSelfOnlyTargets`.
 * @internal
 */
export function getModuleSelfOnlyTargets(
  architecture: ArchitectureDef,
  moduleName: string,
): string[] {
  return getModules(architecture)
    .filter((module) =>
      normalizeModuleAllowedImporters(module.allowedImporters).some(
        (importer) => importer.module === moduleName && importer.selfOnly,
      ))
    .map((module) => module.name);
}

/**
 * A module's own public entry filename: its override, else the shared
 * `architecture.folder` default — the same resolution `getFolderShape` gives
 * a layer.
 * @internal
 */
export function getModuleEntry(architecture: ArchitectureDef, moduleName: string): string {
  const module = getModules(architecture).find((candidate) => candidate.name === moduleName);

  return module?.entry ?? getSharedFolder(architecture).entry;
}

/**
 * `architecture.modules` in whole: optional, and when present, an array of at
 * least one module — an empty array says nothing an omitted key does not.
 * @internal
 */
export function validateModules(modules: ModuleDef[] | undefined): void {
  if (modules === undefined) {
    return;
  }

  if (!Array.isArray(modules)) {
    throw new Error(
      'architecture.modules must be an array when set — omit it for the flat structure, '
      + 'where the declared layers are the top-level folders.',
    );
  }

  if (modules.length === 0) {
    throw new Error(
      'architecture.modules must not be empty — omit the key for the flat structure.',
    );
  }

  const names = new Set<string>();

  for (const module of modules) {
    validateModuleName(module, names);
    rejectUnknownKeys(module, MODULE_KEYS, `module "${module.name}"`);
    validateOwns(module, 'Module');
    validateModuleLayers(module);
    validateModuleEntry(module);
    // `names` holds only earlier modules here, so requiring importers to be in
    // it enforces "declared before" — which keeps the flow one-way and acyclic.
    validateModuleAllowedImporters(module, names);
    names.add(module.name);
  }
}

/** A module name becomes a folder, a file glob, and a diagram node id. */
function validateModuleName(module: ModuleDef, earlier: Set<string>): void {
  if (typeof module?.name !== 'string' || !module.name.trim()) {
    throw new Error('Each module must have a non-empty name.');
  } else if (earlier.has(module.name)) {
    throw new Error(`Duplicate module name: "${module.name}".`);
  } else if (/[*?{}[\]\\/]/.test(module.name)) {
    throw new Error(
      `Module "${module.name}" contains glob or path characters — module names become `
      + 'file globs and folders. Root files are wiring, not a module: leave their '
      + 'hygiene to the project\'s own lint instead of widening the net.',
    );
  } else if (/[\s"'()<>|;%&]/.test(module.name)) {
    // Whitespace, quotes, parens, `&` (node join), `%` (comment), and friends
    // silently corrupt the emitted diagram — fail loud here instead.
    throw new Error(
      `Module "${module.name}" contains characters that corrupt emitted artifacts `
      + '— a module name becomes a folder, a file glob, and a diagram node. '
      + 'Stick to letters, digits, ".", "_", "-".',
    );
  }
}

/** `layers` is a single opt-out, so `false` is the only value that says anything. */
function validateModuleLayers(module: ModuleDef): void {
  if (module.layers !== undefined && module.layers !== false) {
    throw new Error(
      `Module "${module.name}" has layers "${String(module.layers)}" — false is the only `
      + 'accepted value: omit the key to keep the shared architecture.layers nested inside '
      + 'the module, or set it to false for a module that holds its files directly.',
    );
  }
}

/** A module's `entry` override, when set, must be a non-empty string. */
function validateModuleEntry(module: ModuleDef): void {
  if (module.entry !== undefined && (typeof module.entry !== 'string' || !module.entry.trim())) {
    throw new Error(`Module "${module.name}" has an empty entry override.`);
  }
}

/** Each allowed importer must be a distinct module declared before this one. */
function validateModuleAllowedImporters(module: ModuleDef, earlier: Set<string>): void {
  const seen = new Set<string>();

  for (const importer of normalizeModuleAllowedImporters(module.allowedImporters)) {
    if (typeof importer.module !== 'string' || !importer.module.trim()) {
      throw new Error(`Module "${module.name}" has an allowedImporters entry with no module.`);
    }

    rejectUnknownKeys(
      importer,
      ['module', 'selfOnly', 'description'],
      `module "${module.name}" allowedImporters entry "${importer.module}"`,
    );

    if (importer.module === module.name) {
      throw new Error(`Module "${module.name}" cannot list itself as an allowed importer.`);
    } else if (!earlier.has(importer.module)) {
      throw new Error(
        `Module "${module.name}" allows importer "${importer.module}", which is not a module `
        + 'declared before it.',
      );
    } else if (seen.has(importer.module)) {
      throw new Error(`Module "${module.name}" lists importer "${importer.module}" more than once.`);
    }

    seen.add(importer.module);
  }
}
