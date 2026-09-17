import path from 'node:path';

import type { Blueprint } from '../config';
import {
  applicationKey,
  compareVersions,
  installedPackage,
  LIFECYCLE_SINCE,
  lifecycleRootFor,
  manifestOwner,
  readLifecycleState,
} from '../lifecycle';
import type {
  LifecycleStateRead,
  ManifestOwner,
  PackageLocation,
  ProvenanceRecord,
} from '../lifecycle';
import {
  detect,
  findConfigFiles,
  resolveBlueprint,
  resolveRepositoryContext,
} from '../project';
import type { GitReader, ResolveOptions } from '../project';

export interface RemovalApplication {
  key: string;
  root: string;
  blueprint: Blueprint | null;
  installed: PackageLocation | null;
  manifest: ManifestOwner | null;
  provenance: ProvenanceRecord[];
}

export type RemovalMode = 'provenance' | 'partial' | 'legacy';

export interface RemovalFacts {
  root: string;
  repository: boolean;
  state: LifecycleStateRead;
  scope: RemovalApplication[];
  remaining: string[];
  mode: RemovalMode;
}

export interface RemovalFactEffects {
  git: GitReader;
  loadConfig?: ResolveOptions['loadConfig'];
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function loadBlueprint(
  root: string,
  loadConfig: ResolveOptions['loadConfig'],
): Promise<Blueprint | null> {
  try {
    return (await resolveBlueprint(root, { ...detect(root), hasConfig: true }, {
      migrateLegacyConfig: true, loadConfig,
    })).blueprint;
  } catch {
    return null;
  }
}

function applicationRoots(root: string, state: LifecycleStateRead): string[] {
  const configured = findConfigFiles(root).map((file) => path.dirname(file));

  const recorded = state.status === 'present'
    ? Object.keys(state.state.applications).map((key) => path.resolve(root, key))
    : [];

  return [...new Set([...configured, ...recorded])].sort();
}

function modeOf(state: LifecycleStateRead): RemovalMode {
  if (state.status !== 'present') {
    return 'legacy';
  }

  return state.state.provenance === 'complete' ? 'provenance' : 'partial';
}

export function missingStateInstall(facts: RemovalFacts): string | null {
  if (facts.state.status !== 'missing') {
    return null;
  }

  const aware = facts.scope.map((application) => application.installed?.version)
    .find((version) => version !== undefined && compareVersions(version, LIFECYCLE_SINCE) >= 0);

  return aware ?? null;
}

export async function gatherRemovalFacts(
  cwd: string,
  effects: RemovalFactEffects,
): Promise<RemovalFacts> {
  const repository = resolveRepositoryContext(path.resolve(cwd), effects.git);
  const root = lifecycleRootFor(cwd, repository.root);
  const state = readLifecycleState(root);
  const target = path.resolve(cwd);
  const roots = applicationRoots(root, state);

  const below = roots.filter((applicationRoot) => contains(target, applicationRoot));

  const selected = below.length
    ? below
    : roots.filter((applicationRoot) => contains(applicationRoot, target)).slice(-1);

  const inScope = (applicationRoot: string) => selected.includes(applicationRoot);

  const scope = await Promise.all(selected.map(async (applicationRoot) => {
    const key = applicationKey(root, applicationRoot);

    return {
      key,
      root: applicationRoot,
      blueprint: await loadBlueprint(applicationRoot, effects.loadConfig),
      installed: installedPackage(applicationRoot),
      manifest: manifestOwner(applicationRoot, root),
      provenance: state.status === 'present'
        ? state.state.applications[key]?.provenance ?? []
        : [],
    };
  }));

  return {
    root,
    repository: repository.ok,
    state,
    scope,
    remaining: roots.filter((entry) => !inScope(entry)).map((entry) => applicationKey(root, entry)),
    mode: modeOf(state),
  };
}
