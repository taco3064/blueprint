import type { ArchitectureDef } from '../config';
import {
  moduleToLayerBrief,
  renderModuleToLayerAuthorityError,
  renderModuleToLayerRouterError,
  renderTransformationAction,
  renderTransformationInstallHandoff,
  renderTransformationInstallNote,
  renderTransformationNarration,
  renderTransformationPreflightError,
  renderTransformationReady,
  renderTransformationWriteNote,
} from '../operational-contract';
import { AUTHORING_FILE, claudeDirState } from '../project';
import type { ClaudeDirState, ProjectState } from '../project';
import { collectModuleToLayerEvidence, runSurvey } from '../survey';
import type { ModuleToLayerEvidence, SurveyResult } from '../survey';
import { launchAgent } from './agent';
import type { Spawner } from './agent';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import { authoringLauncherActions, emitsClaudeAuthoringLauncher } from './authoring-launcher';
import type { AuthoringAgents } from './authoring-launcher';
import { installCommand } from './plan';
import { cleanupTargets } from './playbook';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import type { TopologyDecision } from './topology';
import type { Action } from './types';

interface ModuleToLayerActionInput {
  state: ProjectState;
  evidence: ModuleToLayerEvidence;
  preflight: TransformationPreflight;
  install?: boolean;
  claudeDir: ClaudeDirState;
  agents?: AuthoringAgents;
}

export function moduleToLayerActions(input: ModuleToLayerActionInput): Action[] {
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
      content: moduleToLayerBrief({
        evidence,
        preflight,
        findings: preflight.inspection.findings ?? [],
        state,
        install: command,
        cleanup: cleanupTargets(input.claudeDir, claudeLauncher),
      }),
      note: renderTransformationWriteNote('module-to-layer', AUTHORING_FILE),
    },
    ...authoringLauncherActions(input.agents),
    ...install,
    {
      kind: 'instruct',
      note: renderTransformationReady('module-to-layer'),
    },
  ];
}

export interface ModuleToLayerInput {
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

export async function runModuleToLayerTransformation(
  input: ModuleToLayerInput,
): Promise<Action[]> {
  const architecture = requireArchitecture(input.architecture);

  assertRouter(input.state);
  const preflight = await preflightFor(input);

  const survey = input.survey ?? runSurvey(input.root, {
    log: () => {},
    sourceRoot: input.topology.selectedApplication!,
  });

  const evidence = collectModuleToLayerEvidence({
    root: input.root,
    survey,
    architecture,
    nextAppRouter: input.state.hasNext,
  });

  const actions = moduleToLayerActions({
    state: input.state,
    evidence,
    preflight,
    install: input.options.install,
    claudeDir: claudeDirState(input.root),
    agents: input.agents,
  });

  input.log(renderTransformationNarration({
    dryRun: input.options.dryRun === true,
    direction: 'module-first → layer-first',
    totalFiles: survey.totalFiles,
  }));

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(renderTransformationAction(action, false));
    }

    return actions;
  }

  apply(input.root, actions, {
    exec: input.options.exec ?? defaultExec,
    onApplied: (action) => input.log(renderTransformationAction(action, true)),
  });

  if (input.options.agent) {
    launchAgent(input.options.agent, input.root, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }

  return actions;
}

function requireArchitecture(architecture: ArchitectureDef | null): ArchitectureDef {
  if (architecture?.modules !== undefined) {
    return architecture;
  }

  throw new Error(renderModuleToLayerAuthorityError());
}

async function preflightFor(input: ModuleToLayerInput): Promise<TransformationPreflight> {
  const selected = input.topology.selectedApplication;
  const preflight = await runTransformationPreflight(input.root, selected ? [selected] : []);

  if (!preflight.ok) {
    throw new Error(renderTransformationPreflightError(
      'Module-first → layer-first',
      preflight,
    ));
  }

  return preflight;
}

function assertRouter(state: ProjectState): void {
  if (!state.hasNext || state.nextRouter === 'app') {
    return;
  }

  throw new Error(renderModuleToLayerRouterError(state.nextRouter));
}
