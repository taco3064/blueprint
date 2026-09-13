import type { ProjectState } from '../project';
import type { InitOptions } from './bootstrap';
import { renderInitOptionError } from '../operational-contract';

export function assertInitOptions(
  state: ProjectState,
  options: InitOptions,
  pristine: boolean,
): void {
  if (state.hasNuxt) {
    throw new Error(renderInitOptionError('nuxt'));
  }

  if (options.preset && options.topology === 'module-first') {
    throw new Error(renderInitOptionError('module-first-preset'));
  }

  if (options.preset && options.authoring) {
    throw new Error(renderInitOptionError('preset-authoring'));
  }

  if (options.topology === undefined) {
    assertAuthoredConfigNotRewritten(state, options, pristine);
  }
}

export function assertAuthoredConfigNotRewritten(
  state: ProjectState,
  options: InitOptions,
  pristine: boolean,
): void {
  if (
    options.authoring
    && state.hasConfig
    && !pristine
    && options.topology !== 'module-first'
  ) {
    throw new Error(renderInitOptionError('authored-config'));
  }
}
