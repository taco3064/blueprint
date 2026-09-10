import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { nextPreset, reactPreset } from '../presets';
import type { SurveyResult } from '../survey';

export type ArchitectureTopology = 'layer-first' | 'module-first';

export interface TopologyObservation {
  current: ArchitectureTopology | null;
  source: 'configured' | 'classified' | 'not-provable';
  selectedApplication: string | null;
  uncertainty?: 'empty' | 'insufficient' | 'mixed' | 'scope';
}

export interface TopologyDecision extends TopologyObservation {
  target: ArchitectureTopology | null;
  operation: 'initialize' | 'adopt' | 'repair' | 'transformation-required' | 'abort';
  path: 'scaffold' | 'authoring' | null;
  reason?: string;
}

export interface TopologySelection {
  topology?: ArchitectureTopology;
  preset?: boolean;
}

const RECOGNIZED_LAYERS = new Set([
  ...reactPreset().architecture.layers.map((layer) => layer.name),
  ...nextPreset({ router: 'both' }).architecture.layers.map((layer) => layer.name),
]);

const STRONG_LAYER_ROOTS = new Set(['pages', 'containers']);

export function observeTopology(
  configured: ArchitectureDef | null,
  survey: SurveyResult | null,
): TopologyObservation {
  if (configured) {
    const resolved = resolveArchitecture(configured);

    return {
      current: resolved.topology,
      source: 'configured',
      selectedApplication: resolved.sourceRoot,
    };
  }

  if (!survey) {
    return notProvable(null, 'insufficient');
  }

  if (survey.scopeRequired) {
    return notProvable(null, 'scope');
  }

  if (survey.totalFiles === 0) {
    return notProvable(survey.sourceRoot ?? 'src', 'empty');
  }

  return classifySurvey(survey);
}

function classifySurvey(survey: SurveyResult): TopologyObservation {
  const directLayerAxis = hasDirectLayerAxis(survey);
  const moduleCandidates = moduleCandidatesOf(survey);

  const moduleAxis = hasRepeatedModuleAxis(survey, moduleCandidates)
    || hasImportModuleAxis(survey, moduleCandidates);

  if (directLayerAxis === moduleAxis) {
    return notProvable(
      survey.sourceRoot ?? 'src',
      directLayerAxis ? 'mixed' : 'insufficient',
    );
  }

  return {
    current: directLayerAxis ? 'layer-first' : 'module-first',
    source: 'classified',
    selectedApplication: survey.sourceRoot ?? 'src',
  };
}

function hasDirectLayerAxis(survey: SurveyResult): boolean {
  const directLayers = survey.folders.filter((folder) =>
    folder.files > 0 && RECOGNIZED_LAYERS.has(folder.folder));

  return directLayers.length >= 2
    && directLayers.some((folder) => STRONG_LAYER_ROOTS.has(folder.folder));
}

function moduleCandidatesOf(survey: SurveyResult) {
  return new Map(
    survey.folders
      .filter((folder) => folder.files > 0
        && folder.folder !== 'app'
        && !RECOGNIZED_LAYERS.has(folder.folder)
        && (folder.children ?? []).some((child) => RECOGNIZED_LAYERS.has(child)))
      .map((folder) => [folder.folder, folder]),
  );
}

function hasRepeatedModuleAxis(
  survey: SurveyResult,
  candidates: ReturnType<typeof moduleCandidatesOf>,
): boolean {
  return (survey.repeatedFolderShapes ?? []).some((shape) =>
    shape.parent === (survey.sourceRoot ?? 'src')
    && shape.instances.filter((instance) => candidates.has(instance)).length >= 2
    && shape.repeatedChildren.some((child) => RECOGNIZED_LAYERS.has(child.folder)));
}

function hasImportModuleAxis(
  survey: SurveyResult,
  candidates: ReturnType<typeof moduleCandidatesOf>,
): boolean {
  return candidates.size >= 2 && survey.edges.some((edge) =>
    edge.from !== edge.to && candidates.has(edge.from) && candidates.has(edge.to));
}

export function decideTopology(
  observation: TopologyObservation,
  selection: TopologySelection = {},
): TopologyDecision {
  if (selection.preset && selection.topology === 'module-first') {
    return incompatiblePreset(observation);
  }

  const requested = selection.preset ? 'layer-first' : selection.topology;

  return decideSelectedTopology(observation, requested);
}

function decideSelectedTopology(
  observation: TopologyObservation,
  requested: ArchitectureTopology | undefined,
): TopologyDecision {
  const target = requested ?? observation.current;

  if (observation.uncertainty === 'scope') {
    return unknown(observation);
  }

  if (observation.source === 'configured') {
    return decideConfigured(observation, requested, target);
  }

  if (isRequestedChange(observation, requested)) {
    return transformation(observation, requested);
  }

  if (!observation.current && observation.uncertainty === 'mixed') {
    return requested === undefined
      ? unknown(observation)
      : transformation(observation, requested);
  }

  if (!target) {
    return unknown(observation);
  }

  return {
    ...observation,
    target,
    operation: operationFor(observation),
    path: target === 'module-first' ? 'authoring' : 'scaffold',
  };
}

function incompatiblePreset(observation: TopologyObservation): TopologyDecision {
  return {
    ...observation,
    target: 'module-first',
    operation: 'abort',
    path: null,
    reason: '--topology module-first cannot be combined with --preset — generic layer presets '
      + 'cannot choose domain modules. Use the module-first authoring flow instead.',
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
  return observation.current || observation.uncertainty === 'insufficient'
    ? 'adopt'
    : 'initialize';
}

function notProvable(
  selectedApplication: string | null,
  uncertainty: NonNullable<TopologyObservation['uncertainty']>,
): TopologyObservation {
  return { current: null, source: 'not-provable', selectedApplication, uncertainty };
}

function transformation(
  observation: TopologyObservation,
  target: ArchitectureTopology,
): TopologyDecision {
  const current = observation.current ?? 'an unclassified existing tree';

  return {
    ...observation,
    target,
    operation: 'transformation-required',
    path: null,
    reason: `Changing ${current} to ${target} requires a topology transformation, but that `
      + 'direction is not delivered yet. No files were changed.',
  };
}

function unknown(observation: TopologyObservation): TopologyDecision {
  const reason = observation.uncertainty === 'scope'
    ? 'Cannot determine the current architecture topology while multiple application scopes '
    + 'remain unresolved. Select one application, run `blueprint survey --source-root '
    + '<application>/src`, then run init from that application root.'
    : 'Cannot determine the current architecture topology safely.\n'
      + 'Re-run with:\n'
      + '  blueprint init --topology layer-first\n'
      + 'or\n'
      + '  blueprint init --topology module-first';

  return {
    ...observation,
    target: null,
    operation: 'abort',
    path: null,
    reason,
  };
}
