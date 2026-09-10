import { scan } from '../inspect';
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
import { decideTopology, observeTopology } from './topology';
import type { ArchitectureTopology, TopologyDecision } from './topology';
import { runTopologyTransformation } from './transformation-dispatch';
import type { Action } from './types';

export interface InitOptions extends ResolveOptions {

  install?: boolean;

  dryRun?: boolean;

  preset?: boolean;

  authoring?: boolean;

  topology?: ArchitectureTopology;

  agent?: AgentKind;

  exec?: Exec;

  spawn?: Spawner;

  log?: (message: string) => void;
}

interface RunContext {
  options: InitOptions;
  log: (message: string) => void;
}

export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  const pristine = state.hasConfig && isPristineScaffold(root, state);

  assertInitOptions(state, options);

  if (options.topology === undefined) {
    assertAuthoredConfigNotRewritten(state, options, pristine);
  }

  const { resolved, survey, topology } = await prepareTopology({
    root, state, options, pristine,
  });

  assertTopologySupported(topology);

  if (topology.path === 'transformation') {
    return runTopologyTransformation({ root, state, options, log, survey, topology,
      architecture: resolved?.blueprint.architecture ?? null,
    });
  }

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
    forkNote: survey ? freshScaffoldNote(survey) : null,
    resolved,
  });
}

interface InitTopologyInput {
  root: string;
  state: ProjectState;
  options: InitOptions;
  pristine: boolean;
}

async function prepareTopology(input: InitTopologyInput) {
  const resolved = await resolveConfigured(input);
  const survey = surveyForTopology(input);
  const observation = observeForInit({ input, resolved, survey });

  const topology = decideTopology(observation, {
    topology: input.options.topology,
    preset: input.options.preset,
  });

  return { resolved, survey, topology };
}

async function resolveConfigured(
  input: InitTopologyInput,
): Promise<Awaited<ReturnType<typeof resolveBlueprint>> | null> {
  if (!input.state.hasConfig || input.pristine) {
    return null;
  }

  try {
    return await resolveBlueprint(input.root, input.state, input.options);
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

function observeForInit(ctx: {
  input: InitTopologyInput;
  resolved: Awaited<ReturnType<typeof resolveBlueprint>> | null;
  survey: SurveyResult | null;
}) {
  const { input, resolved, survey } = ctx;

  if (!input.pristine) {
    return observeTopology(resolved?.blueprint.architecture ?? null, survey);
  }

  return {
    current: 'layer-first' as const,
    source: 'configured' as const,
    selectedApplication: survey?.sourceRoot ?? (input.state.nextSrcDir ? 'src' : '.'),
  };
}

function assertInitOptions(state: ProjectState, options: InitOptions): void {
  if (state.hasNuxt) {
    throw new Error(
      'Nuxt is not supported. Blueprint enforces the dependency flow through '
      + 'static import analysis, and Nuxt\'s auto-imports leave no import '
      + 'statements to analyze — the result would be a hollow, false "clean". '
      + 'See https://taco3064.github.io/blueprint/guide/field-tested.',
    );
  }

  if (options.preset && options.authoring) {
    throw new Error('--preset and --authoring are mutually exclusive — pick one.');
  }
}

function assertTopologySupported(topology: TopologyDecision): void {
  if (topology.path === null) {
    throw new Error(topology.reason);
  }
}

function assertAuthoredConfigNotRewritten(
  state: ProjectState,
  options: InitOptions,
  pristine: boolean,
): void {
  if (
    options.authoring
    && state.hasConfig
    && !pristine
    && options.topology !== 'module-first'
  ) {
    throwAuthoredConfigRefusal();
  }
}

function throwAuthoredConfigRefusal(): never {
  throw new Error(
    'blueprint.config.mjs differs from what init would scaffold — so it is yours, not '
    + 'init\'s output, and re-authoring rewrites it from scratch rather than merging. '
    + 'The structure is reproducible; the comments explaining WHY each threshold and '
    + 'ownership was chosen are not. Copy anything you want to keep, then delete the '
    + 'file yourself if you really want the playbook. Put those comments back into the '
    + 'rewritten config, each beside the clause it explains — not only into the report, '
    + 'which is read once while the config is what the next re-authoring will read.',
  );
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

  return (topology.source !== 'configured' && topology.path === 'authoring')
    || Boolean(options.authoring)
    || survey.scopeRequired === true
    || survey.totalFiles >= BROWNFIELD_MIN_FILES
    || (state.hasNext && !state.nextRouter);
}

function freshScaffoldNote(survey: SurveyResult): string {
  return `Fresh scaffold (${survey.totalFiles} source files < ${BROWNFIELD_MIN_FILES}) — `
    + 'scaffolding the framework preset directly; no blueprint-authoring.md is written '
    + 'on this path. Force the authoring playbook instead with: '
    + 'blueprint init --topology layer-first --authoring.';
}

async function runScaffold(
  root: string,
  state: ProjectState,
  ctx: RunContext & {
    forkNote: string | null;
    resolved: Awaited<ReturnType<typeof resolveBlueprint>> | null;
  },
): Promise<Action[]> {
  const { options } = ctx;

  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource } = ctx.resolved ?? await resolveBlueprint(root, state, {
    ...options,
    ...(agentTarget ? { scaffoldAgents: [agentTarget] } : {}),
  });

  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const scanResult = scan(root, sourceRoot);

  const actions = plan(state, blueprint, {
    ...options,
    configSource,
    agentTarget,
    hasSourceFiles: scanResult.files.length > 0,
    existingSourceDirs: listSourceDirs(root, sourceRoot),
    existingAgentFiles: readTexts(root, contractPaths(blueprint, agentTarget)),
  });

  actions.push(
    ...templateCleanupActions(scanResult, blueprint, configSource),
    ...gitignoreActions(root, blueprint, agentTarget),
  );

  applyLintWiring(actions, lintScriptAction(root, blueprint, configSource !== null));
  actions.push(...scaffoldNotes(state, blueprint, { configSource, agentTarget }));

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
  });

  if (removeScaffold) {
    actions.unshift({
      kind: 'rm',
      path: CONFIG_FILE,
      note: `${CONFIG_FILE} (pristine preset scaffold — removed; the playbook authors the real one)`,
    });
  }

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · without a config → authoring flow (${survey.totalFiles} source files surveyed)${

      topology === 'layer-first'
      && options.authoring
      && survey.totalFiles < BROWNFIELD_MIN_FILES
      && !survey.scopeRequired
        ? ` — below the brownfield threshold (${BROWNFIELD_MIN_FILES} source files), forced by --authoring; the playbook's own verdict will be the early exit`
        : ''
    }`,
  );

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
  agentNote: string | null;
}

function narrate(actions: Action[], root: string, ctx: NarrateContext): void {
  const { options, log } = ctx;

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${ctx.framework} · ${ctx.packageManager}`,
  );

  if (ctx.forkNote) {
    log(`· ${ctx.forkNote}`);
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
): string | null {
  if (!agent) {
    return null;
  }

  return configSource === null
    ? `\n--agent ${agent}: nothing to author (blueprint.config.mjs exists) — no session launched; contract emitted for ${agent} only.`
    : `\n--agent ${agent}: fresh scaffold, nothing to author — no session launched; contract emitted for ${agent} only.`;
}

function isPristineScaffold(root: string, state: ProjectState): boolean {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  const agentVariants: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];

  const candidates = (['vue', 'react'] as const).flatMap((framework) =>
    agentVariants.flatMap((agents) => [
      buildConfigSource(framework, state.projectName, agents),
      buildConfigSource(framework, undefined, agents),
    ]),
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

      onInstallStarting: (action) => log(
        `  → install: ${action.note}\n`

        + `      ${action.command}\n`
        + '      This is the one step that needs the registry. Silence while it works is'
        + ' normal; minutes of silence means it cannot get there — stop it and run the line'
        + ' above yourself, or re-run init with `--no-install`. No version list to find'
        + ' first: these are your project\'s dependencies, installed unpinned so eslint'
        + ' resolves to the newest supported major.\n'

        + '      Stopping is safe: this is the last step, so every file above is already on'
        + ' disk. What stopping omits is these packages in `package.json` — this line is the'
        + ' only thing that records them there, so until it runs, a failure naming one of'
        + ' them is that gap and not a broken adoption.',
      ),
    });
  } catch (error) {
    const skipped = actions.slice(landed + 1).filter((action) => action.kind !== 'instruct');
    const failed = actions[landed];

    log(`  ✗ ${failed.kind}: ${failed.note}`);

    throw new Error(
      `${(error as Error).message}\n\n`
      + `  init stopped at the ${failed.kind} step above. Everything printed before it is on disk`
      + `${skipped.length ? `, and ${skipped.length} planned effect(s) did NOT happen:\n${skipped.map((action) => `    · ${action.kind}: ${action.note}`).join('\n')}` : ' — nothing else was planned below it'}\n\n`
      + '  Re-running `blueprint init` is idempotent: fix the cause and the missing effects land, '
      + 'the applied ones stay. To finish the file plan without this step, run '
      + '`blueprint init --no-install` — the dependency list is then printed for you to install '
      + 'yourself.',
    );
  }
}

function formatAction(action: Action, dryRun: boolean): string {
  if (action.kind === 'instruct') {
    return `  · ${action.note}`;
  }

  const mark = dryRun ? 'would' : action.kind === 'rm' ? '−' : '✓';

  return `  ${mark} ${action.kind}: ${action.note}`;
}
