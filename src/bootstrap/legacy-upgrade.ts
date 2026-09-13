import path from 'node:path';

import { CONFIG_FILE } from '../project';
import type { ProjectState, RepositoryBlueprint } from '../project';
import { apply, defaultExec } from './apply';
import type { InitOptions } from './bootstrap';
import type { Action } from './types';
import {
  renderActionLine,
  renderLegacyCheckpointNote,
  renderLegacyUpgradeMessage,
} from '../operational-contract';

export function legacyUpgradeNote(options: InitOptions, repositoryConfigCount = 1): string {
  return renderLegacyUpgradeMessage({
    dryRun: Boolean(options.dryRun),
    topology: options.topology,
    repositoryConfigCount,
  });
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
        note: renderLegacyCheckpointNote(configPath),
      };
    });

  if (options.dryRun) {
    for (const action of actions) {
      log(renderActionLine(action.kind, action.note, 'dry-run'));
    }
  } else {
    apply(repositoryRoot, actions, {
      exec: defaultExec,
      onApplied: (action) => log(renderActionLine(action.kind, action.note, 'applied')),
    });
  }

  return actions;
}
