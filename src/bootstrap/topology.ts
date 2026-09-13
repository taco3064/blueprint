import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import type { SurveyResult } from '../survey';
import { renderTopologyReason } from '../operational-contract';
import type { OperationalText } from '../operational-contract';

export type ArchitectureTopology = 'layer-first' | 'module-first';

export interface TopologyObservation {
  current: ArchitectureTopology | null;
  repository: ArchitectureTopology | null;
  source: 'configured' | 'repository' | 'none';
  selectedApplication: string | null;
  uncertainty?: 'empty' | 'unmanaged' | 'scope';
}

export interface TopologyDecision extends TopologyObservation {
  target: ArchitectureTopology | null;
  operation: 'initialize' | 'adopt' | 'repair' | 'transformation-required' | 'abort';
  path: 'scaffold' | 'authoring' | 'transformation' | null;
  reason?: OperationalText;
}

export interface TopologySelection {
  topology?: ArchitectureTopology;
  preset?: boolean;
}

export function observeTopology(
  configured: ArchitectureDef | null,
  survey: SurveyResult | null,
  repository: ArchitectureTopology | null = null,
): TopologyObservation {
  if (configured) {
    const resolved = resolveArchitecture(configured);

    return {
      current: resolved.topology,
      repository: repository ?? resolved.topology,
      source: 'configured',
      selectedApplication: resolved.sourceRoot,
    };
  }

  if (!survey) {
    return unconfigured(null, repository, 'unmanaged');
  }

  if (survey.scopeRequired) {
    return unconfigured(null, repository, 'scope');
  }

  if (survey.totalFiles === 0) {
    return unconfigured(survey.sourceRoot ?? 'src', repository, 'empty');
  }

  return unconfigured(survey.sourceRoot ?? 'src', repository, 'unmanaged');
}

export function decideTopology(
  observation: TopologyObservation,
  selection: TopologySelection = {},
): TopologyDecision {
  if (selection.preset && selection.topology === 'module-first') {
    return incompatiblePreset(observation);
  }

  const requested = selection.topology;

  return decideSelectedTopology(observation, requested, Boolean(selection.preset));
}

function decideSelectedTopology(
  observation: TopologyObservation,
  requested: ArchitectureTopology | undefined,
  preset: boolean,
): TopologyDecision {
  if (observation.uncertainty === 'scope') {
    return unknown(observation);
  }

  if (observation.source === 'configured') {
    if (preset) {
      return configuredPresetRefusal(observation);
    }

    return decideConfigured(observation, requested, requested ?? observation.current);
  }

  if (observation.source === 'repository') {
    return decideInherited(observation, requested, preset);
  }

  if (!requested) {
    return unknown(observation);
  }

  return {
    ...observation,
    target: requested,
    operation: operationFor(observation),
    path: requested === 'module-first' ? 'authoring' : 'scaffold',
  };
}

function decideInherited(
  observation: TopologyObservation,
  requested: ArchitectureTopology | undefined,
  preset: boolean,
): TopologyDecision {
  const inherited = observation.repository!;

  if (requested !== undefined && requested !== inherited) {
    return repositoryMismatch(observation, requested);
  }

  if (preset && inherited === 'module-first') {
    return repositoryPresetRefusal(observation);
  }

  return {
    ...observation,
    target: inherited,
    operation: 'adopt',
    path: inherited === 'module-first' ? 'authoring' : 'scaffold',
  };
}

function incompatiblePreset(observation: TopologyObservation): TopologyDecision {
  return {
    ...observation,
    target: 'module-first',
    operation: 'abort',
    path: null,
    reason: renderTopologyReason({ kind: 'module-first-preset' }),
  };
}

function configuredPresetRefusal(observation: TopologyObservation): TopologyDecision {
  return {
    ...observation,
    target: observation.current,
    operation: 'abort',
    path: null,
    reason: renderTopologyReason({ kind: 'configured-preset' }),
  };
}

function repositoryPresetRefusal(observation: TopologyObservation): TopologyDecision {
  return {
    ...observation,
    target: observation.repository,
    operation: 'abort',
    path: null,
    reason: renderTopologyReason({ kind: 'repository-preset' }),
  };
}

function repositoryMismatch(
  observation: TopologyObservation,
  requested: ArchitectureTopology,
): TopologyDecision {
  return {
    ...observation,
    target: requested,
    operation: 'abort',
    path: null,
    reason: renderTopologyReason({
      kind: 'repository-mismatch',
      repository: observation.repository,
      requested,
    }),
  };
}

function decideConfigured(
  observation: TopologyObservation,
  requested: ArchitectureTopology | undefined,
  target: ArchitectureTopology | null,
): TopologyDecision {
  return isRequestedChange(observation, requested)
    ? transformation(observation, requested)
    : { ...observation, target, operation: 'repair', path: 'scaffold' };
}

function isRequestedChange(
  observation: TopologyObservation,
  requested: ArchitectureTopology | undefined,
): requested is ArchitectureTopology {
  return requested !== undefined
    && observation.current !== null
    && observation.current !== requested;
}

function operationFor(observation: TopologyObservation): 'adopt' | 'initialize' {
  return observation.uncertainty === 'empty' ? 'initialize' : 'adopt';
}

function unconfigured(
  selectedApplication: string | null,
  repository: ArchitectureTopology | null,
  uncertainty: NonNullable<TopologyObservation['uncertainty']>,
): TopologyObservation {
  return {
    current: null,
    repository,
    source: repository ? 'repository' : 'none',
    selectedApplication,
    uncertainty,
  };
}

function transformation(
  observation: TopologyObservation,
  target: ArchitectureTopology,
): TopologyDecision {
  return {
    ...observation,
    target,
    operation: 'transformation-required',
    path: 'transformation',
  };
}

function unknown(observation: TopologyObservation): TopologyDecision {
  const reason = renderTopologyReason({
    kind: observation.uncertainty === 'scope' ? 'scope-unresolved' : 'topology-unset',
  });

  return {
    ...observation,
    target: null,
    operation: 'abort',
    path: null,
    reason,
  };
}
