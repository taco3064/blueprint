import type { InitOptions } from './bootstrap';

export function legacyUpgradeNote(options: InitOptions): string {
  if (options.dryRun) {
    return options.topology === 'module-first'
      ? 'Blueprint 3.2 phase 1 dry run: would migrate the config to valid 4.0 layer-first. '
      + 'No files were changed; re-run without --dry-run to create the checkpoint before the '
      + 'guarded topology transformation.'
      : 'Blueprint 3.2 dry run: would migrate the config to valid 4.0 layer-first without '
        + 'topology movement. No files were changed; re-run without --dry-run to apply it.';
  }

  if (options.topology === 'module-first') {
    return 'Blueprint 3.2 phase 1: migrated the config to valid 4.0 layer-first. Verify and '
      + 'commit this state, then re-run `blueprint init --topology module-first` to start the '
      + 'guarded topology transformation.';
  }

  return 'Blueprint 3.2 config migrated to valid 4.0 layer-first without topology movement.';
}
