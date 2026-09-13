import { AUTHORING_FILE, claudeDirState } from '../project';
import type { ClaudeDirState, ProjectState } from '../project';
import type { ArchitectureDef } from '../config';
import {
  layerToModuleBrief,
  renderLayerToModuleRouterError,
  renderTransformationAction,
  renderTransformationInstallHandoff,
  renderTransformationInstallNote,
  renderTransformationNarration,
  renderTransformationPreflightError,
  renderTransformationReady,
  renderTransformationWriteNote,
} from '../operational-contract';
import { collectTransformationEvidence, runSurvey } from '../survey';
import type { SurveyResult, TransformationEvidence } from '../survey';
import { authoringLauncherActions, emitsClaudeAuthoringLauncher } from './authoring-launcher';
import type { AuthoringAgents } from './authoring-launcher';
import { launchAgent } from './agent';
import type { Spawner } from './agent';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import { installCommand } from './plan';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import { cleanupTargets } from './playbook';
import type { TopologyDecision } from './topology';
import type { Action } from './types';

interface TransformationActionInput {
  state: ProjectState;
  evidence: TransformationEvidence;
  preflight: TransformationPreflight;
  install?: boolean;
  claudeDir: ClaudeDirState;
  agents?: AuthoringAgents;
}

export function transformationActions(
  input: TransformationActionInput,
): Action[] {
  const { state, evidence, preflight } = input;
  const command = installCommand(state.packageManager, ['@kekkai/blueprint']);
  const claudeLauncher = emitsClaudeAuthoringLauncher(input.agents);

  const install: Action[] = !state.missingDeps.includes('@kekkai/blueprint')
    ? []
    : input.install !== false
      ? [{ kind: 'install', command, note: renderTransformationInstallNote() }]
      : [{
          kind: 'instruct',
          note: renderTransformationInstallHandoff(command),
        }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: layerToModuleBrief({
        evidence,
        preflight,
        findings: preflight.inspection.findings ?? [],
        state,
        install: command,
        cleanup: cleanupTargets(input.claudeDir, claudeLauncher),
      }),
      note: renderTransformationWriteNote('layer-to-module', AUTHORING_FILE),
    },
    ...authoringLauncherActions(input.agents),
    ...install,
    {
      kind: 'instruct',
      note: renderTransformationReady('layer-to-module'),
    },
  ];
}

export interface LayerToModuleInput {
  root: string;
  state: ProjectState;
  options: {
    install?: boolean;
    dryRun?: boolean;
    agent?: 'claude' | 'codex';
    exec?: Exec;
    spawn?: Spawner;
  };
  log: (message: string) => void;
  survey: SurveyResult | null;
  topology: TopologyDecision;
  architecture: ArchitectureDef | null;
  agents?: AuthoringAgents;
}

export async function runLayerToModuleTransformation(
  input: LayerToModuleInput,
): Promise<Action[]> {
  assertRouter(input.state);
  const preflight = await preflightFor(input);
  const survey = surveyFor(input);
  const evidence = collectTransformationEvidence(input.root, survey, input.architecture);

  const actions = transformationActions({
    state: input.state,
    evidence,
    preflight,
    install: input.options.install,
    claudeDir: claudeDirState(input.root),
    agents: input.agents,
  });

  narratePlan(input, survey, actions);

  if (!input.options.dryRun) {
    apply(input.root, actions, {
      exec: input.options.exec ?? defaultExec,
      onApplied: (action) => input.log(renderTransformationAction(action, true)),
    });

    launchRequestedAgent(input);
  }

  return actions;
}

async function preflightFor(input: LayerToModuleInput): Promise<TransformationPreflight> {
  const selected = input.topology.selectedApplication;
  const preflight = await runTransformationPreflight(input.root, selected ? [selected] : []);

  assertPreflight(preflight);

  return preflight;
}

function surveyFor(input: LayerToModuleInput): SurveyResult {
  return input.survey ?? runSurvey(input.root, {
    log: () => {},
    sourceRoot: input.topology.selectedApplication!,
  });
}

function narratePlan(input: LayerToModuleInput, survey: SurveyResult, actions: Action[]): void {
  input.log(renderTransformationNarration({
    dryRun: input.options.dryRun === true,
    direction: 'layer-first → module-first',
    totalFiles: survey.totalFiles,
  }));

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(renderTransformationAction(action, false));
    }
  }
}

function launchRequestedAgent(input: LayerToModuleInput): void {
  if (input.options.agent) {
    launchAgent(input.options.agent, input.root, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }
}

function assertRouter(state: ProjectState): void {
  if (!state.hasNext) {
    return;
  }

  const error = renderLayerToModuleRouterError(state.nextRouter);

  if (error) {
    throw new Error(error);
  }
}

function assertPreflight(preflight: TransformationPreflight): void {
  if (preflight.ok) {
    return;
  }

  throw new Error(renderTransformationPreflightError('Layer-first → module-first', preflight));
}
