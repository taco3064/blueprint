import { assessLintIntegration, scan } from '../inspect';
import { resolveArchitecture } from '../config';
import {
  applicationNeedsBlueprint,
  CONFIG_FILE,
  detect,
  listSourceDirs,
  readTexts,
  resolveBlueprint,
  claudeDirState,
  tscArtifactsOutOfTree,
  viteTsCoverage,
} from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import { runSurvey } from '../survey';
import type { SurveyResult } from '../survey';
import { authoringActions, BROWNFIELD_MIN_FILES, forcedAuthoringExit } from './authoring';
import { agentTargetOf, launchAgent } from './agent';
import type { AgentKind, Spawner } from './agent';
import {
  applyLintWiring,
  contractPaths,
  gitignoreActions,
  lintScriptAction,
  scaffoldNotes,
  templateCleanupActions,
} from './notes';
import { plan } from './plan';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import { decideTopology } from './topology';
import type { ArchitectureTopology, TopologyDecision } from './topology';
import { runTopologyTransformation } from './transformation-dispatch';
import { observeRepositoryTopology } from './repository-topology';
import { observePristineScaffold } from './pristine';
import * as legacyUpgrade from './legacy-upgrade';
import { assertAuthoredConfigNotRewritten, assertInitOptions } from './init-options';
import type { Action } from './types';
import { runTransformationRecovery } from './transformation-recovery';
import { adoptionRecorder, logPlannedAdoption } from './lifecycle';
import { freshAuthoringAgents } from './authoring-launcher';
import {
  completeTransformationRetirement, transformationRetirement,
} from './transformation-resume';
import {
  renderActionLine,
  renderAgentSessionNote,
  renderAuthoringFlowBanner,
  renderForkNote,
  renderFreshScaffoldNote,
  renderInitBanner,
  renderInitStopped,
  renderInstallStarting,
  renderScaffoldRemovalNote,
} from '../operational-contract';
import type { OperationalText } from '../operational-contract';

export interface InitOptions extends ResolveOptions {

  install?: boolean;

  dryRun?: boolean;

  preset?: boolean;

  authoring?: boolean;

  recoverTransformation?: boolean;

  topology?: ArchitectureTopology;

  agent?: AgentKind;

  exec?: Exec;

  spawn?: Spawner;

  log?: (message: string) => void;
}

type RunContext = { options: InitOptions; log: (message: string) => void };

export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  if (options.recoverTransformation) {
    return runTransformationRecovery(root, options);
  }

  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  const pristineTopology = state.hasConfig ? observePristineScaffold(root, state) : null;
  const pristine = pristineTopology !== null;

  assertInitOptions(state, options, pristine);

  const input = { root, state, options, pristine, pristineTopology, log };

  return runPreparedTopology(input, await prepareTopology(input));
}

async function runPreparedTopology(
  input: InitTopologyInput,
  prepared: Awaited<ReturnType<typeof prepareTopology>>,
): Promise<Action[]> {
  const { root, state, options, pristine, log } = input;
  const { resolved, survey, topology, blueprints, legacy, architecture } = prepared;

  const retirement = transformationRetirement({
    root, state, blueprint: resolved?.blueprint ?? null, authoring: options.authoring,
    requestedTopology: options.topology,
  });

  if (retirement) {
    return completeTransformationRetirement(root, { retirement, dryRun: options.dryRun, log },
      (trailingActions) => runScaffold(root, state, {
        options,
        log,
        forkNote: null,
        resolved,
        trailingActions,
      }));
  }

  assertTopologySupported(topology);

  if (topology.path === 'transformation') {
    return runTopologyTransformation({ root, state, options, log, survey, topology,
      architecture: architecture!,
      agents: resolved?.blueprint.emit?.agents,
      repositoryBlueprints: blueprints,
    });
  }

  // Stryker disable next-line ConditionalExpression: undefined already ran this refusal above.
  if (options.topology !== undefined) {
    assertAuthoredConfigNotRewritten(state, options, pristine);
  }

  if (survey && takesAuthoringPath({ state, options, survey, topology })) {
    return runAuthoring(root, state, {
      options,
      log,
      survey,
      removeScaffold: pristine,
      topology: topology.target!,
    });
  }

  return runScaffold(root, state, {
    options,
    log,
    forkNote: legacy
      ? legacyUpgrade.legacyUpgradeNote(options, legacy)
      : survey ? freshScaffoldNote(survey, topology.target!) : null,
    resolved,
    topology: topology.target!,
  });
}

type InitTopologyInput = RunContext & {
  root: string;
  state: ProjectState;
  pristine: boolean;
  pristineTopology: ArchitectureTopology | null;
};

async function prepareTopology(input: InitTopologyInput) {
  const resolved = await resolveConfigured(input);
  const survey = surveyForTopology(input);

  const localAuthority = resolved ?? (input.pristineTopology
    ? await resolveBlueprint(
        input.root,
        { ...input.state, hasConfig: false },
        { ...input.options, topology: input.pristineTopology },
      )
    : null);

  const repository = await observeRepositoryTopology({
    state: input.state,
    pristine: input.pristine,
    survey,
    loadConfig: input.options.loadConfig,
    resolvedBlueprint: resolved?.blueprint,
    pristineBlueprint: input.pristine ? localAuthority!.blueprint : undefined,
  });

  const checkpoint = legacyUpgrade.migrateLegacyRepositoryCheckpoint(
    input.state,
    repository.blueprints,
    { selectedConfig: input.state.hasConfig, options: input.options, log: input.log },
  );

  const topology = decideTopology(repository.observation, {
    topology: checkpoint.length || resolved?.legacyConfig ? 'layer-first' : input.options.topology,
    preset: input.options.preset,
    moduleRunway: !input.state.hasNext,
  });

  const legacy = legacyUpgrade.legacyOutcome(input, {
    resolved, blueprints: repository.blueprints,
  });

  return {
    resolved: afterLegacyCheckpoint(resolved, checkpoint.length > 0),
    survey,
    topology,
    blueprints: repository.blueprints,
    legacy,
    architecture: localAuthority?.blueprint.architecture,
  };
}

function afterLegacyCheckpoint(
  resolved: Awaited<ReturnType<typeof resolveBlueprint>> | null,
  written: boolean,
): typeof resolved {
  return written && resolved ? { ...resolved, legacyConfig: false } : resolved;
}

async function resolveConfigured(
  input: InitTopologyInput,
): Promise<Awaited<ReturnType<typeof resolveBlueprint>> | null> {
  if (!input.state.hasConfig || input.pristine) {
    return null;
  }

  try {
    return await resolveBlueprint(input.root, input.state,
      { ...input.options, migrateLegacyConfig: true });
  } catch (error) {
    assertAuthoredConfigNotRewritten(input.state, input.options, input.pristine);

    throw error;
  }
}

function surveyForTopology(input: InitTopologyInput): SurveyResult | null {
  return !input.state.hasConfig || Boolean(input.options.authoring && input.pristine)
    ? surveySource(input.root, input.state)
    : null;
}

function assertTopologySupported(topology: TopologyDecision): void {
  if (topology.path === null) {
    throw new Error(topology.reason!);
  }
}

function surveySource(root: string, state: ProjectState): SurveyResult {
  return runSurvey(root, {
    log: () => {},
    sourceRoot: state.hasNext && !state.nextSrcDir ? '.' : undefined,
  });
}

function takesAuthoringPath(ctx: {
  state: ProjectState;
  options: InitOptions;
  survey: SurveyResult;
  topology: TopologyDecision;
}): boolean {
  const { state, options, survey, topology } = ctx;

  if (options.preset) {
    return false;
  }

  return topology.path === 'authoring'
    || Boolean(options.authoring)
    || survey.totalFiles >= BROWNFIELD_MIN_FILES
    || (state.hasNext && !state.nextRouter);
}

function freshScaffoldNote(survey: SurveyResult, topology: ArchitectureTopology): string {
  return renderFreshScaffoldNote({
    files: survey.totalFiles,
    threshold: BROWNFIELD_MIN_FILES,
    topology,
  });
}

async function runScaffold(
  root: string,
  state: ProjectState,
  ctx: RunContext & {
    forkNote: string | null;
    resolved: Awaited<ReturnType<typeof resolveBlueprint>> | null;
    topology?: ArchitectureTopology;
    trailingActions?: Action[];
  },
): Promise<Action[]> {
  const { options } = ctx;

  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource, legacyConfig } = ctx.resolved
    ?? await resolveBlueprint(root, state, {
      ...options,
      topology: ctx.topology,
      ...(agentTarget ? { scaffoldAgents: [agentTarget] } : {}),
    });

  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const scanResult = scan(root, sourceRoot);

  const actions = plan(state, blueprint, {
    ...options,
    lintIntegration: await assessLintIntegration(state, blueprint, { scanResult }),
    configSource,
    agentTarget,
    hasSourceFiles: scanResult.files.length > 0,
    existingSourceDirs: listSourceDirs(root, sourceRoot),
    existingAgentFiles: readTexts(root, contractPaths(blueprint, agentTarget)),
  });

  if (legacyConfig && configSource !== null) {
    actions.unshift(legacyUpgrade.legacyConfigBackup(root, 'blueprint.config.mjs'));
  }

  actions.push(
    ...templateCleanupActions(scanResult, blueprint, configSource),
    ...gitignoreActions(root, blueprint, agentTarget),
  );

  if (!state.legacyEslintConfig) {
    applyLintWiring(actions, lintScriptAction(
      root, blueprint, { greenfield: configSource !== null, eslintBasePath: state.eslintBasePath },
    ));
  }

  actions.push(...scaffoldNotes(state, blueprint, { configSource, agentTarget }));
  actions.push(...(ctx.trailingActions ?? []));

  narrate(actions, root, {
    ...ctx,
    state,
    framework: blueprint.framework,
    packageManager: state.packageManager,
    agentNote: agentSessionNote(options.agent, configSource),
  });

  return actions;
}

function runAuthoring(
  root: string,
  state: ProjectState,
  ctx: RunContext & {
    survey: SurveyResult;
    removeScaffold: boolean;
    topology: ArchitectureTopology;
  },
): Action[] {
  const { options, log, survey, removeScaffold, topology } = ctx;

  const actions = authoringActions(survey, {

    claudeDir: claudeDirState(root),

    viteTs: viteTsCoverage(root),

    tscOut: tscArtifactsOutOfTree(root),
    packageManager: state.packageManager,
    needsInstall: applicationNeedsBlueprint(state),
    install: options.install,
    next: state.hasNext,
    topology,
    agents: freshAuthoringAgents(options.agent),
  });

  if (removeScaffold) {
    actions.unshift({
      kind: 'rm',
      path: CONFIG_FILE,
      note: renderScaffoldRemovalNote(CONFIG_FILE),
    });
  }

  log(renderAuthoringFlowBanner({
    dryRun: Boolean(options.dryRun),
    files: survey.totalFiles,
    forcedExit: forcedAuthoringExit(survey, {
      authoring: options.authoring, topology, next: state.hasNext,
    }),
    threshold: BROWNFIELD_MIN_FILES,
  }));

  if (options.dryRun) {
    logPlannedAdoption(actions, log);

    return actions;
  }

  applyAndNarrate(root, actions, { exec: options.exec ?? defaultExec, log, state });

  if (options.agent) {
    launchAgent(options.agent, root, { log, spawner: options.spawn });
  }

  return actions;
}

interface NarrateContext extends RunContext {
  state: ProjectState;
  forkNote: string | null;
  framework: string;
  packageManager: string;
  agentNote: OperationalText | null;
}

function narrate(actions: Action[], root: string, ctx: NarrateContext): void {
  const { options, log } = ctx;

  log(renderInitBanner(Boolean(options.dryRun), ctx.framework, ctx.packageManager));

  if (ctx.forkNote) {
    log(renderForkNote(ctx.forkNote));
  }

  if (options.dryRun) {
    logPlannedAdoption(actions, log);

    return;
  }

  applyAndNarrate(root, actions, { exec: options.exec ?? defaultExec, log, state: ctx.state });

  if (ctx.agentNote) {
    log(ctx.agentNote);
  }
}

function agentSessionNote(
  agent: AgentKind | undefined,
  configSource: string | null,
): OperationalText | null {
  if (!agent) {
    return null;
  }

  return renderAgentSessionNote(agent, configSource === null);
}

function applyAndNarrate(
  root: string,
  actions: Action[],
  effects: { exec: Exec; log: (line: string) => void; state: ProjectState },
): void {
  const { exec, log } = effects;
  const recorder = adoptionRecorder(root, effects.state, actions);
  let landed = 0;
  let finished = false;

  try {
    apply(root, actions, {
      exec,
      onApplied: (action) => {
        landed += 1;
        recorder.landed(action);
        log(formatAction(action));
      },

      onInstallStarting: (action) => log(renderInstallStarting(action.note, action.command)),
    });

    finished = true;
  } catch (error) {
    const skipped = actions.slice(landed + 1).filter((action) => action.kind !== 'instruct');
    const failed = actions[landed];

    log(renderActionLine(failed.kind, failed.note, 'failed'));

    throw new Error(renderInitStopped({
      cause: (error as Error).message,
      failedKind: failed.kind,
      skipped,
    }));
  } finally {
    recorder.finish(log, finished);
  }
}

function formatAction(action: Action): OperationalText {
  return renderActionLine(action.kind, action.note, 'applied');
}
