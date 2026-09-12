import fs from 'node:fs';
import path from 'node:path';

import {
  isLegacyBlueprintMigration,
  migrateLegacyBlueprint,
  migratedConfigSource,
  resolveArchitecture,
  validateBlueprint,
} from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { CONFIG_FILE } from './detect';
import { versionedModuleUrl } from './load';

export interface RepositoryBlueprint {
  applicationRoot: string;
  architecture: ArchitectureDef;
  blueprint: Blueprint;
  legacyConfig?: boolean;
  migratedConfigSource?: string | null;
  topology: 'layer-first' | 'module-first';
}

export interface RepositoryBlueprintOptions {
  loadConfig?: (file: string) => Promise<Blueprint>;
  known?: { file: string; blueprint: Blueprint }[];
  migrateLegacyConfig?: boolean;
}

const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules']);

export async function resolveRepositoryBlueprints(
  repositoryRoot: string,
  options: RepositoryBlueprintOptions = {},
): Promise<RepositoryBlueprint[]> {
  const files = findConfigFiles(repositoryRoot);

  return Promise.all(files.map(async (file) => {
    const { blueprint, legacyConfig } = await loadBlueprint(file, options);
    const architecture = blueprint.architecture;

    return {
      applicationRoot: path.dirname(file),
      architecture,
      blueprint,
      legacyConfig,
      migratedConfigSource: legacyConfig ? migratedConfigSource(blueprint) : null,
      topology: resolveArchitecture(architecture).topology,
    };
  }));
}

function findConfigFiles(root: string): string[] {
  const files: string[] = [];

  visit(root, files, root);

  return files.sort();
}

function visit(root: string, files: string[], repositoryRoot: string): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  if (root !== repositoryRoot && entries.some((entry) => entry.name === '.git')) {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        visit(path.join(root, entry.name), files, repositoryRoot);
      }

      continue;
    }

    if (entry.isFile() && entry.name === CONFIG_FILE) {
      files.push(path.join(root, entry.name));
    }
  }
}

async function loadBlueprint(
  file: string,
  options: RepositoryBlueprintOptions,
): Promise<{ blueprint: Blueprint; legacyConfig: boolean }> {
  try {
    const known = options.known?.find((entry) => path.resolve(entry.file) === path.resolve(file));

    const loaded = known?.blueprint ?? (options.loadConfig
      ? await options.loadConfig(file)
      : await defaultLoadConfig(file));

    if (!loaded) {
      throw new Error('missing default export.');
    }

    const migration = options.migrateLegacyConfig
      ? migrateLegacyBlueprint(loaded)
      : null;

    const blueprint = migration?.blueprint ?? loaded;

    const legacyConfig = migration !== null
      && (migration.migrated || isLegacyBlueprintMigration(loaded));

    validateBlueprint(blueprint);

    return { blueprint, legacyConfig };
  } catch (error) {
    throw new Error(`${path.relative(path.dirname(file), file)} at ${file}: ${(error as Error).message}`);
  }
}

/* v8 ignore start -- real dynamic import, tests inject a loader */
const defaultLoadConfig = (file: string): Promise<Blueprint> =>
  import(versionedModuleUrl(file)).then((module) => module.default as Blueprint);
/* v8 ignore stop */
