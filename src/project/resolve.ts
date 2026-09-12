import path from 'node:path';

import { nextPreset, reactPreset, vuePreset } from '../presets';
import type { NextRouter } from '../presets';
import {
  isLegacyBlueprintMigration,
  migrateLegacyBlueprint,
  migratedConfigSource,
  validateBlueprint,
} from '../config';
import type { AgentTarget, Blueprint } from '../config';
import { CONFIG_FILE } from './detect';
import { versionedModuleUrl } from './load';
import type { ProjectState } from './types';

export interface ResolveOptions {
  /** Force the framework when detection is ambiguous. */
  framework?: 'vue' | 'react';
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: (file: string) => Promise<Blueprint>;
  migrateLegacyConfig?: boolean;
  /**
   * Persist these contract targets into a scaffolded config (`init --agent`), or
   * the next plain init grows the dropped contract back. An existing config is
   * never touched — its own `emit.agents` is the declaration.
   */
  scaffoldAgents?: AgentTarget[];
}

/* v8 ignore start -- real dynamic import, not run in unit tests (loadConfig is injected) */
const defaultLoadConfig = (file: string): Promise<Blueprint> =>
  import(versionedModuleUrl(file)).then((module) => module.default as Blueprint);
/* v8 ignore stop */

export async function resolveBlueprint(
  root: string,
  state: ProjectState,
  options: ResolveOptions,
): Promise<{ blueprint: Blueprint; configSource: string | null; legacyConfig: boolean }> {
  if (state.hasConfig) {
    return loadAuthored(root, options);
  }

  const agents = options.scaffoldAgents;

  if (state.hasNext && state.nextRouter) {
    return nextScaffold(
      { router: state.nextRouter, srcDir: state.nextSrcDir },
      state.projectName,
      agents,
    );
  }

  const framework = options.framework ?? state.framework;

  if (framework !== 'vue' && framework !== 'react') {
    throw new Error(
      'Could not detect a framework (vue or react). Re-run with --framework vue|react.',
    );
  }

  const preset = framework === 'vue' ? vuePreset : reactPreset;

  const blueprint = preset({
    ...(state.projectName ? { name: state.projectName } : {}),
    ...(agents ? { emit: { agents } } : {}),
  });

  return {
    blueprint,
    configSource: buildConfigSource(framework, state.projectName, agents),
    legacyConfig: false,
  };
}

async function loadAuthored(
  root: string,
  options: ResolveOptions,
): Promise<{ blueprint: Blueprint; configSource: string | null; legacyConfig: boolean }> {
  /* v8 ignore next -- the default falls back to a real import; tests inject loadConfig */
  const load = options.loadConfig ?? defaultLoadConfig;
  const loaded = await load(path.resolve(root, CONFIG_FILE));

  try {
    if (!loaded) {
      throw new Error('missing default export.');
    }

    const migration = options.migrateLegacyConfig
      ? migrateLegacyBlueprint(loaded)
      : null;

    const blueprint = migration?.blueprint ?? loaded;

    const migrated = migration !== null
      && (migration.migrated || isLegacyBlueprintMigration(loaded));

    validateBlueprint(blueprint);

    return {
      blueprint,
      configSource: migrated ? migratedConfigSource(blueprint) : null,
      legacyConfig: migrated,
    };
  } catch (error) {
    throw new Error(`${CONFIG_FILE}: ${(error as Error).message}`);
  }
}

function nextScaffold(
  next: { router: NextRouter; srcDir: boolean },
  name: string | undefined,
  agents: AgentTarget[] | undefined,
): { blueprint: Blueprint; configSource: string; legacyConfig: false } {
  return {
    blueprint: nextPreset({
      ...(name ? { name } : {}),
      ...next,
      ...(agents ? { emit: { agents } } : {}),
    }),
    configSource: buildNextConfigSource(next, name, agents),
    legacyConfig: false,
  };
}

function emitField(agents?: AgentTarget[]): string[] {
  return agents?.length
    ? [`emit: { agents: [${agents.map((agent) => `'${agent}'`).join(', ')}] }`]
    : [];
}

export function buildConfigSource(
  framework: 'vue' | 'react',
  name?: string,
  agents?: AgentTarget[],
): string {
  const factory = framework === 'vue' ? 'vuePreset' : 'reactPreset';
  const fields = [...(name ? [`name: '${name}'`] : []), ...emitField(agents)];
  const arg = fields.length ? `{ ${fields.join(', ')} }` : '';

  return [
    `import { ${factory} } from '@kekkai/blueprint';`,
    '',
    `export default ${factory}(${arg});`,
    '',
  ].join('\n');
}

export function buildNextConfigSource(
  next: { router: NextRouter; srcDir: boolean },
  name?: string,
  agents?: AgentTarget[],
): string {
  const opts = [
    ...(name ? [`name: '${name}'`] : []),
    `router: '${next.router}'`,
    ...(next.srcDir ? ['srcDir: true'] : []),
    ...emitField(agents),
  ].join(', ');

  return [
    'import { nextPreset } from \'@kekkai/blueprint\';',
    '',
    `export default nextPreset({ ${opts} });`,
    '',
  ].join('\n');
}
