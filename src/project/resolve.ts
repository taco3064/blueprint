import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { nextPreset, reactPreset, vuePreset } from '../presets';
import type { NextRouter } from '../presets';
import { validateBlueprint } from '../config';
import type { Blueprint } from '../config';
import { CONFIG_FILE } from './detect';
import type { ProjectState } from './types';

export interface ResolveOptions {
  /** Force the framework when detection is ambiguous. */
  framework?: 'vue' | 'react';
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: (file: string) => Promise<Blueprint>;
}

/* v8 ignore start -- real dynamic import, not run in unit tests (loadConfig is injected) */
const defaultLoadConfig = (file: string): Promise<Blueprint> =>
  import(pathToFileURL(file).href).then((module) => module.default as Blueprint);
/* v8 ignore stop */

/**
 * Resolve the blueprint for a project: load an existing `blueprint.config.mjs`,
 * or fall back to a framework preset. `configSource` is the file body to write
 * when one was generated (null when an existing config was loaded).
 */
export async function resolveBlueprint(
  root: string,
  state: ProjectState,
  options: ResolveOptions,
): Promise<{ blueprint: Blueprint; configSource: string | null }> {
  if (state.hasConfig) {
    /* v8 ignore next -- the default falls back to a real import; tests inject loadConfig */
    const load = options.loadConfig ?? defaultLoadConfig;
    const blueprint = await load(path.resolve(root, CONFIG_FILE));

    // A hand-written config can bypass defineBlueprint entirely — validate on
    // load so a structural mistake fails right here with a precise message,
    // not as an undefined-property crash deep inside a command.
    try {
      if (!blueprint) throw new Error('missing default export.');

      validateBlueprint(blueprint);
    } catch (error) {
      throw new Error(`${CONFIG_FILE}: ${(error as Error).message}`);
    }

    return { blueprint, configSource: null };
  }

  // Next.js with a detected route tree gets its own preset — the route dir
  // is the top layer, and the source root follows --src-dir.
  if (state.hasNext && state.nextRouter) {
    const blueprint = nextPreset({
      ...(state.projectName ? { name: state.projectName } : {}),
      router: state.nextRouter,
      srcDir: state.nextSrcDir,
    });

    return {
      blueprint,
      configSource: buildNextConfigSource(state.nextRouter, state.nextSrcDir, state.projectName),
    };
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

/** Render the generated `blueprint.config.mjs` body for a fresh project. */
export function buildConfigSource(framework: 'vue' | 'react', name?: string): string {
  const factory = framework === 'vue' ? 'vuePreset' : 'reactPreset';
  const arg = name ? `{ name: '${name}' }` : '';

  return [
    `import { ${factory} } from '@kekkai/blueprint';`,
    '',
    `export default ${factory}(${arg});`,
    '',
  ].join('\n');
}

/** Render the generated config body for a fresh Next.js project. */
export function buildNextConfigSource(router: NextRouter, srcDir: boolean, name?: string): string {
  const opts = [
    ...(name ? [`name: '${name}'`] : []),
    `router: '${router}'`,
    ...(srcDir ? ['srcDir: true'] : []),
  ].join(', ');

  return [
    'import { nextPreset } from \'@kekkai/blueprint\';',
    '',
    `export default nextPreset({ ${opts} });`,
    '',
  ].join('\n');
}
