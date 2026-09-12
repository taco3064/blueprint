import type { ProjectState } from '../project';
import type { InitOptions } from './bootstrap';

export function assertInitOptions(
  state: ProjectState,
  options: InitOptions,
  pristine: boolean,
): void {
  if (state.hasNuxt) {
    throw new Error(
      'Nuxt is not supported. Blueprint enforces the dependency flow through '
      + 'static import analysis, and Nuxt\'s auto-imports leave no import '
      + 'statements to analyze — the result would be a hollow, false "clean". '
      + 'See https://taco3064.github.io/blueprint/guide/field-tested.',
    );
  }

  if (options.preset && options.topology === 'module-first') {
    throw new Error(
      '--topology module-first cannot be combined with --preset — generic layer presets '
      + 'cannot choose domain modules. Use the module-first authoring flow instead. '
      + 'No files were changed.',
    );
  }

  if (options.preset && options.authoring) {
    throw new Error('--preset and --authoring are mutually exclusive — pick one.');
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
    throw new Error(
      'blueprint.config.mjs differs from what init would scaffold — so it is yours, not '
      + 'init\'s output, and re-authoring rewrites it from scratch rather than merging. '
      + 'The structure is reproducible; the comments explaining WHY each threshold and '
      + 'ownership was chosen are not. Copy anything you want to keep, then delete the '
      + 'file yourself if you really want the playbook. Put those comments back into the '
      + 'rewritten config, each beside the clause it explains — not only into the report, '
      + 'which is read once while the config is what the next re-authoring will read.',
    );
  }
}
