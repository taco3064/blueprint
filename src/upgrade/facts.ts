import fs from 'node:fs';
import path from 'node:path';

import { migrateLegacyBlueprint } from '../config';
import type { Blueprint } from '../config';
import {
  applicationKey,
  installedPackage,
  lifecycleRootFor,
  lifecycleStateHistory,
  manifestOwner,
  readLifecycleState,
  sourceCheckpoint,
} from '../lifecycle';
import type {
  ApplicationFacts,
  LifecycleStateRead,
  ManifestOwner,
  PackageLocation,
  SourceCheckpoint,
  UpgradeCatalog,
} from '../lifecycle';
import {
  AUTHORING_FILE,
  defaultGitReader,
  findConfigFiles,
  resolveProjectContext,
  resolveRepositoryContext,
  TRANSFORMATION_OBLIGATION_FILE,
  unwrapModule,
  versionedModuleUrl,
} from '../project';
import type { GitReader, PackageManager } from '../project';

export type ConfigLoader = (file: string) => Promise<unknown>;

export interface UpgradeApplication {
  key: string;
  root: string;
  installed: PackageLocation | null;
  manifest: ManifestOwner | null;
  packageManager: PackageManager;
  facts: ApplicationFacts;
}

export interface UpgradeFacts {
  root: string;
  applications: UpgradeApplication[];
  state: LifecycleStateRead;
  checkpoint: SourceCheckpoint;
  git: { repository: boolean; changes: string[] };
  workflows: string[];
  unreadable: { application: string; cause: string } | null;
}

export interface FactEffects {
  git?: GitReader;
  loadConfig?: ConfigLoader;
  catalog: UpgradeCatalog;
}

/* v8 ignore start -- real dynamic import of the project config; tests inject loadConfig */
const defaultLoadConfig: ConfigLoader = async (file) =>
  unwrapModule(await import(versionedModuleUrl(file)));
/* v8 ignore stop */

export function lifecycleRoot(cwd: string, git: GitReader = defaultGitReader): string {
  return lifecycleRootFor(cwd, resolveRepositoryContext(path.resolve(cwd), git).root);
}

function legacyFacts(key: string, loaded: unknown): ApplicationFacts {
  const blueprint = loaded as Blueprint & { architecture?: { module?: { private?: unknown } } };
  const privateLayers = blueprint.architecture?.module?.private;

  return {
    root: key,
    legacyShape: migrateLegacyBlueprint(blueprint).migrated,
    legacyKeys: Array.isArray(privateLayers)
      ? { 'module.private': privateLayers.map(String) }
      : {},
  };
}

async function application(
  root: string,
  file: string,
  loadConfig: ConfigLoader,
): Promise<UpgradeApplication> {
  const applicationRoot = path.dirname(file);
  const key = applicationKey(root, applicationRoot);
  const manifest = manifestOwner(applicationRoot, root);

  return {
    key,
    root: applicationRoot,
    installed: installedPackage(applicationRoot),
    manifest,
    packageManager: resolveProjectContext(manifest?.root ?? applicationRoot).packageManager,
    facts: legacyFacts(key, await loadConfig(file)),
  };
}

function gitFacts(root: string, git: GitReader): UpgradeFacts['git'] {
  const status = git(['status', '--porcelain'], root);

  if (status.status !== 0) {
    return { repository: false, changes: [] };
  }

  return {
    repository: true,
    changes: status.stdout.split('\n').map((line) => line.slice(3).trim()).filter(Boolean),
  };
}

function workflows(root: string, applications: UpgradeApplication[]): string[] {
  const candidates = [root, ...applications.map((entry) => entry.root)].flatMap((directory) =>
    [AUTHORING_FILE, TRANSFORMATION_OBLIGATION_FILE].map((file) => path.join(directory, file)));

  return [...new Set(candidates)]
    .filter((file) => fs.existsSync(file))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
}

export async function gatherUpgradeFacts(cwd: string, effects: FactEffects): Promise<UpgradeFacts> {
  const git = effects.git ?? defaultGitReader;
  const root = lifecycleRoot(cwd, git);
  const loadConfig = effects.loadConfig ?? defaultLoadConfig;
  const applications: UpgradeApplication[] = [];
  let unreadable: UpgradeFacts['unreadable'] = null;

  for (const file of findConfigFiles(root)) {
    try {
      applications.push(await application(root, file, loadConfig));
    } catch (error) {
      unreadable ??= {
        application: applicationKey(root, path.dirname(file)),
        cause: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const state = readLifecycleState(root);

  return {
    root,
    applications,
    state,
    checkpoint: sourceCheckpoint({
      state,
      installed: applications.map((entry) => entry.installed?.version ?? null),
      legacyShape: applications.some((entry) => entry.facts.legacyShape),
      catalog: effects.catalog,
      history: lifecycleStateHistory(root, git),
    }),
    git: gitFacts(root, git),
    workflows: workflows(root, applications),
    unreadable,
  };
}
