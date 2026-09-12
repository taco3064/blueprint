import path from 'node:path';

import { CONFIG_FILE } from '../project';
import type { ProjectState, RepositoryBlueprint } from '../project';
import { apply, defaultExec } from './apply';
import type { InitOptions } from './bootstrap';
import type { Action } from './types';

export function legacyUpgradeNote(options: InitOptions, repositoryConfigCount = 1): string {
  const scope = repositoryConfigCount > 1
    ? `all ${repositoryConfigCount} Blueprint configs in the repository`
    : 'the config';

  if (options.dryRun) {
    return options.topology === 'module-first'
      ? `Blueprint 3.2 phase 1 dry run: would migrate ${scope} to valid 4.0 layer-first. `
      + 'No files were changed; re-run without --dry-run to create the checkpoint before the '
      + 'guarded topology transformation.'
      : 'Blueprint 3.2 dry run: would migrate the config to valid 4.0 layer-first without '
        + 'topology movement. No files were changed; re-run without --dry-run to apply it.';
  }

  if (options.topology === 'module-first') {
    return `Blueprint 3.2 phase 1: migrated ${scope} to valid 4.0 layer-first. Verify and `
      + 'commit this state, then re-run `blueprint init --topology module-first` to start the '
      + 'guarded topology transformation.';
  }

  return 'Blueprint 3.2 config migrated to valid 4.0 layer-first without topology movement.';
}

export function migrateLegacyRepositoryCheckpoint(
  state: ProjectState,
  blueprints: RepositoryBlueprint[],
  input: { selectedConfig: boolean; options: InitOptions; log: (message: string) => void },
): Action[] {
  const { options, log } = input;

  if (!input.selectedConfig || options.topology !== 'module-first') {
    return [];
  }

  const repositoryRoot = state.repositoryRoot ?? state.applicationRoot;

  const actions = blueprints
    .filter((entry) => entry.legacyConfig)
    .map((entry): Action => {
      const configPath = path.relative(
        repositoryRoot,
        path.join(entry.applicationRoot, CONFIG_FILE),
      );

      return {
        kind: 'write',
        path: configPath,
        content: entry.migratedConfigSource!,
        note: `${configPath} (Blueprint 3.2 → 4.0 layer-first checkpoint)`,
      };
    });

  if (options.dryRun) {
    for (const action of actions) {
      log(`  would ${action.kind}: ${action.note}`);
    }
  } else {
    apply(repositoryRoot, actions, {
      exec: defaultExec,
      onApplied: (action) => log(`  ✓ ${action.kind}: ${action.note}`),
    });
  }

  return actions;
}
