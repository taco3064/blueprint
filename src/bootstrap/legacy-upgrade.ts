import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { CONFIG_FILE } from '../project';
import type { ProjectState, RepositoryBlueprint, ResolvedBlueprint } from '../project';
import { apply, defaultExec } from './apply';
import type { InitOptions } from './bootstrap';
import type { Action } from './types';
import {
  renderActionLine,
  renderLegacyCheckpointNote,
  renderLegacyUpgradeMessage,
} from '../operational-contract';
import type { LegacyManualRewriteFact } from '../operational-contract';

export interface LegacyOutcome {
  rewritten: number;
  manual: LegacyManualRewriteFact[];
}

export function legacyUpgradeNote(options: InitOptions, legacy: LegacyOutcome): string {
  return renderLegacyUpgradeMessage({
    dryRun: Boolean(options.dryRun),
    topology: options.topology,
    repositoryConfigCount: legacy.rewritten,
    manual: legacy.manual,
  });
}

export function legacyOutcome(
  input: { state: ProjectState; options: InitOptions },
  sources: { resolved: ResolvedBlueprint | null; blueprints: RepositoryBlueprint[] },
): LegacyOutcome | null {
  const repositoryRoot = input.state.repositoryRoot ?? input.state.applicationRoot;

  const entries = checkpointApplies(input.state.hasConfig, input.options)
    ? sources.blueprints.flatMap((entry) => entry.legacySource
        ? [{ config: configPath(repositoryRoot, entry), source: entry.legacySource }]
        : [])
    : sources.resolved?.legacySource
      ? [{ config: CONFIG_FILE, source: sources.resolved.legacySource }]
      : [];

  return entries.length
    ? {
        rewritten: entries.filter((entry) => entry.source.kind === 'rewritten').length,
        manual: entries.flatMap(({ config, source }) => source.kind === 'manual'
          ? [{ config, declarations: source.declarations }]
          : []),
      }
    : null;
}

export function migrateLegacyRepositoryCheckpoint(
  state: ProjectState,
  blueprints: RepositoryBlueprint[],
  input: { selectedConfig: boolean; options: InitOptions; log: (message: string) => void },
): Action[] {
  const { options, log } = input;

  if (!checkpointApplies(input.selectedConfig, options)) {
    return [];
  }

  const repositoryRoot = state.repositoryRoot ?? state.applicationRoot;

  const actions = blueprints.flatMap((entry): Action[] => {
    const source = entry.legacySource;

    if (source?.kind !== 'rewritten') {
      return [];
    }

    const file = configPath(repositoryRoot, entry);

    return [
      legacyConfigBackup(repositoryRoot, file),
      { kind: 'write', path: file, content: source.source,
        note: renderLegacyCheckpointNote(file) },
    ];
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

function checkpointApplies(selectedConfig: boolean, options: InitOptions): boolean {
  return selectedConfig && options.topology === 'module-first';
}

function configPath(repositoryRoot: string, entry: RepositoryBlueprint): string {
  return path.relative(repositoryRoot, path.join(entry.applicationRoot, CONFIG_FILE));
}

export function legacyConfigBackup(root: string, configPath: string): Action {
  const content = fs.readFileSync(path.join(root, configPath), 'utf-8');
  const digest = createHash('sha256').update(content).digest('hex');
  const backup = `${configPath}.pre-v4-${digest}`;

  return {
    kind: 'write', path: backup, content, note: renderLegacyCheckpointNote(backup, true),
  };
}
