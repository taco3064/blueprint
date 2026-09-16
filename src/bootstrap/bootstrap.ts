import { assessLintIntegration, scan } from '../inspect';
import { resolveArchitecture } from '../config';
import type { AgentTarget } from '../config';
import {
  buildConfigSource,
  buildNextConfigSource,
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
import { authoringActions, BROWNFIELD_MIN_FILES } from './authoring';
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
import * as legacyUpgrade from './legacy-upgrade';
import { assertAuthoredConfigNotRewritten, assertInitOptions } from './init-options';
import type { Action } from './types';
import { runTransformationRecovery } from './transformation-recovery';
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

  const pristine = state.hasConfig && isPristineScaffold(root, state);

  assertInitOptions(state, options, pristine);

  const input = { root, state, options, pristine, log };

  return runPreparedTopology(input, await prepareTopology(input));
}

async function runPreparedTopology(
  input: InitTopologyInput,
  prepared: Awaited<ReturnType<typeof prepareTopology>>,
): Promise<Action[]> {
  const { root, state, options, pristine, log } = input;
  const { resolved, survey, topology, blueprints, legacyCount, architecture } = prepared;

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
    forkNote: legacyCount
      ? legacyUpgrade.legacyUpgradeNote(options, legacyCount)
      : survey ? freshScaffoldNote(survey) : null,
    resolved,
  });
}

type InitTopologyInput = RunContext
  & { root: string; state: ProjectState; pristine: boolean };

async function prepareTopology(input: InitTopologyInput) {
  const resolved = await resolveConfigured(input);
  const survey = surveyForTopology(input);

  const localAuthority = resolved ?? (input.pristine
    ? await resolveBlueprint(input.root, { ...input.state, hasConfig: false }, input.options)
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
  });

  const legacyCount = checkpoint.length
    ? repository.blueprints.filter((entry) => entry.legacyConfig).length
    : Number(resolved?.legacyConfig);

  return {
    resolved: afterLegacyCheckpoint(resolved, checkpoint.length > 0),
    survey,
    topology,
    blueprints: repository.blueprints,
    legacyCount,
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

function freshScaffoldNote(survey: SurveyResult): string {
  return renderFreshScaffoldNote(survey.totalFiles, BROWNFIELD_MIN_FILES);
}

async function runScaffold(
  root: string,
  state: ProjectState,
  ctx: RunContext & {
    forkNote: string | null;
    resolved: Awaited<ReturnType<typeof resolveBlueprint>> | null;
    trailingActions?: Action[];
  },
): Promise<Action[]> {
  const { options } = ctx;

  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource, legacyConfig } = ctx.resolved
    ?? await resolveBlueprint(root, state, {
      ...options,
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

  if (legacyConfig) {
    actions.unshift(legacyUpgrade.legacyConfigBackup(root, 'blueprint.config.mjs'));
  }

  actions.push(
    ...templateCleanupActions(scanResult, blueprint, configSource),
    ...gitignoreActions(root, blueprint, agentTarget),
  );

  if (!state.legacyEslintConfig) {
    applyLintWiring(actions, lintScriptAction(root, blueprint, configSource !== null));
  }

  actions.push(...scaffoldNotes(state, blueprint, { configSource, agentTarget }));
  actions.push(...(ctx.trailingActions ?? []));

  narrate(actions, root, {
    ...ctx,
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
    needsInstall: state.missingDeps.includes('@kekkai/blueprint'),
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
    forcedBelowThreshold: Boolean(
      topology === 'layer-first'
      && options.authoring
      && survey.totalFiles < BROWNFIELD_MIN_FILES
      && !survey.scopeRequired,
    ),
    threshold: BROWNFIELD_MIN_FILES,
  }));

  if (options.dryRun) {
    for (const action of actions) {
      log(formatAction(action, true));
    }

    return actions;
  }

  applyAndNarrate(root, actions, { exec: options.exec ?? defaultExec, log });

  if (options.agent) {
    launchAgent(options.agent, root, { log, spawner: options.spawn });
  }

  return actions;
}

interface NarrateContext extends RunContext {
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
    for (const action of actions) {
      log(formatAction(action, true));
    }

    return;
  }

  applyAndNarrate(root, actions, { exec: options.exec ?? defaultExec, log });

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

function isPristineScaffold(root: string, state: ProjectState): boolean {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  const agentVariants: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];
  const topologyVariants: ('module-first' | undefined)[] = [undefined, 'module-first'];

  const candidates = (['vue', 'react'] as const).flatMap((framework) =>
    agentVariants.flatMap((agents) => topologyVariants.flatMap((topology) => [
      buildConfigSource(framework, state.projectName, agents, topology),
      buildConfigSource(framework, undefined, agents, topology),
    ])),
  );

  // Stryker disable next-line ConditionalExpression: null router cannot match a scaffold.
  if (state.nextRouter) {
    for (const agents of agentVariants) {
      const next = { router: state.nextRouter, srcDir: state.nextSrcDir };

      candidates.push(
        buildNextConfigSource(next, state.projectName, agents),
        buildNextConfigSource(next, undefined, agents),
      );
    }
  }

  return candidates.some((candidate) => candidate === text);
}

function applyAndNarrate(
  root: string,
  actions: Action[],
  effects: { exec: Exec; log: (line: string) => void },
): void {
  const { exec, log } = effects;
  let landed = 0;

  try {
    apply(root, actions, {
      exec,
      onApplied: (action) => {
        landed += 1;
        log(formatAction(action, false));
      },

      onInstallStarting: (action) => log(renderInstallStarting(action.note, action.command)),
    });
  } catch (error) {
    const skipped = actions.slice(landed + 1).filter((action) => action.kind !== 'instruct');
    const failed = actions[landed];

    log(renderActionLine(failed.kind, failed.note, 'failed'));

    throw new Error(renderInitStopped({
      cause: (error as Error).message,
      failedKind: failed.kind,
      skipped,
    }));
  }
}

function formatAction(action: Action, dryRun: boolean): OperationalText {
  return renderActionLine(action.kind, action.note, dryRun ? 'dry-run' : 'applied');
}