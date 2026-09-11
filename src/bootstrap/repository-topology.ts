import path from 'node:path';

import type { Blueprint } from '../config';
import { CONFIG_FILE, resolveRepositoryBlueprints } from '../project';
import type { ProjectState, RepositoryBlueprint } from '../project';
import type { SurveyResult } from '../survey';
import { observeTopology } from './topology';
import type { ArchitectureTopology, TopologyObservation } from './topology';

export async function observeRepositoryTopology(input: {
  state: ProjectState;
  pristine: boolean;
  survey: SurveyResult | null;
  resolvedBlueprint?: Blueprint;
  pristineBlueprint?: Blueprint;
  loadConfig?: (file: string) => Promise<Blueprint>;
}): Promise<{
  observation: TopologyObservation;
  blueprints: RepositoryBlueprint[];
}> {
  const localBlueprint = input.resolvedBlueprint ?? input.pristineBlueprint;

  const repository = await resolveRepositoryTopology({
    repositoryRoot: input.state.repositoryRoot ?? input.state.applicationRoot,
    applicationRoot: input.state.applicationRoot,
    loadConfig: input.loadConfig,
    localBlueprint,
  });

  const observation = input.pristine
    ? {
        current: 'layer-first' as const,
        repository: repository.topology!,
        source: 'configured' as const,
        selectedApplication: input.survey?.sourceRoot
          ?? (input.state.nextSrcDir ? 'src' : '.'),
      }
    : observeTopology(
        input.resolvedBlueprint?.architecture ?? null,
        input.survey,
        repository.topology,
      );

  return { observation, blueprints: repository.blueprints };
}

export async function resolveRepositoryTopology(input: {
  repositoryRoot: string;
  applicationRoot: string;
  loadConfig?: (file: string) => Promise<Blueprint>;
  localBlueprint?: Blueprint;
}): Promise<{
  topology: ArchitectureTopology | null;
  blueprints: RepositoryBlueprint[];
}> {
  const blueprints = await resolveRepositoryBlueprints(input.repositoryRoot, {
    loadConfig: input.loadConfig,
    known: input.localBlueprint
      ? [{
          file: path.join(input.applicationRoot, CONFIG_FILE),
          blueprint: input.localBlueprint,
        }]
      : undefined,
  });

  const topologies = [...new Set(blueprints.map((entry) => entry.topology))];

  if (topologies.length > 1) {
    const applications = blueprints
      .map((entry) => {
        const application = path.relative(input.repositoryRoot, entry.applicationRoot)
          .split(path.sep)
          .join('/') || '.';

        return `${application}: ${entry.topology}`;
      })
      .join('\n  ');

    throw new Error(
      'Blueprint configs in one repository must share one topology, but mixed topology was '
      + `found:\n  ${applications}\nAlign every config before init; no files were changed.`,
    );
  }

  return { topology: topologies[0] ?? null, blueprints };
}
