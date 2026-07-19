import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { reactPreset, vuePreset } from '../presets';
import type { Blueprint } from '../config/types';
import { CONFIG_FILE, detect } from './detect';
import { plan } from './plan';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import type { Action, ProjectState } from './types';

export interface InitOptions {
  /** Force the framework when detection is ambiguous. */
  framework?: 'vue' | 'react';
  /** Install missing deps (default true). */
  install?: boolean;
  /** Print the plan without applying it. */
  dryRun?: boolean;
  /** Dependency install runner (default `execSync`). */
  exec?: Exec;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: (file: string) => Promise<Blueprint>;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/* v8 ignore start -- real dynamic import, not run in unit tests (loadConfig is injected) */
const defaultLoadConfig = (file: string): Promise<Blueprint> =>
  import(pathToFileURL(file).href).then((module) => module.default as Blueprint);
/* v8 ignore stop */

/** Run `blueprint init` in `root`. Returns the planned actions (for tests / dry-run). */
export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint, configSource } = await resolveBlueprint(root, state, options);
  const actions = plan(state, blueprint, configSource, options);

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${blueprint.framework} · ${state.packageManager}`,
  );

  for (const action of actions) {
    log(formatAction(action, Boolean(options.dryRun)));
  }

  if (!options.dryRun) {
    apply(root, actions, options.exec ?? defaultExec);
  }

  return actions;
}

async function resolveBlueprint(
  root: string,
  state: ProjectState,
  options: InitOptions,
): Promise<{ blueprint: Blueprint; configSource: string | null }> {
  if (state.hasConfig) {
    /* v8 ignore next -- the default falls back to a real import; tests inject loadConfig */
    const load = options.loadConfig ?? defaultLoadConfig;

    return { blueprint: await load(path.resolve(root, CONFIG_FILE)), configSource: null };
  }

  const framework = options.framework ?? state.framework;

  if (framework !== 'vue' && framework !== 'react') {
    throw new Error(
      'Could not detect a framework (vue or react). Re-run with --framework vue|react.',
    );
  }

  const preset = framework === 'vue' ? vuePreset : reactPreset;
  const blueprint = preset(state.projectName ? { name: state.projectName } : {});

  return { blueprint, configSource: buildConfigSource(framework, state.projectName) };
}

function buildConfigSource(framework: 'vue' | 'react', name?: string): string {
  const factory = framework === 'vue' ? 'vuePreset' : 'reactPreset';
  const arg = name ? `{ name: '${name}' }` : '';

  return [
    `import { ${factory} } from '@kekkai/blueprint';`,
    '',
    `export default ${factory}(${arg});`,
    '',
  ].join('\n');
}

function formatAction(action: Action, dryRun: boolean): string {
  if (action.kind === 'instruct') {
    return `  · ${action.note}`;
  }

  return `  ${dryRun ? 'would' : '✓'} ${action.kind}: ${action.note}`;
}
