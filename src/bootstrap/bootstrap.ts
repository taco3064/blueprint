import { scan } from '../inspect/scan';
import type { AgentTarget } from '../config';
import {
  buildConfigSource,
  buildNextConfigSource,
  CONFIG_FILE,
  detect,
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
import type { Action } from './types';

export interface InitOptions extends ResolveOptions {
  /** Install missing deps (default true). */
  install?: boolean;
  /** Print the plan without applying it. */
  dryRun?: boolean;
  /** Force the preset scaffold on a brownfield repo (skip the authoring flow). */
  preset?: boolean;
  /**
   * Force the authoring playbook even below the file-count threshold — the
   * symmetric escape hatch to `--preset`, and mutually exclusive with it.
   */
  authoring?: boolean;
  /** Launch this agent CLI on the authoring playbook after writing it. */
  agent?: AgentKind;
  /** Dependency install runner (default `execSync`). */
  exec?: Exec;
  /** Agent-CLI spawn runner (default `spawnSync`, stdio inherited). */
  spawn?: Spawner;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** Everything a run needs after the fork decision, so no path carries seven arguments. */
interface RunContext {
  options: InitOptions;
  log: (message: string) => void;
}

/** Run `blueprint init` in `root`. Returns the planned actions (for tests / dry-run). */
export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  // A config byte-identical to init's own scaffold output is init-owned, so
  // `--authoring` may take it over. A hand-edited one is the user's: refuse.
  const pristine = state.hasConfig && isPristineScaffold(root, state);

  assertInitSupported(state, options, pristine);

  // Brownfield without a config: scaffolding a preset would be a lie — the
  // layers already exist and must be *read*. Survey first; the playbook is
  // emitted instead (an agent or a human executes it; init runs again after).
  const survey = configIsInitsToWrite(state, options, pristine) ? surveySource(root, state) : null;

  if (survey && takesAuthoringPath(state, options, survey)) {
    return runAuthoring(root, state, { options, log, survey, removeScaffold: pristine });
  }

  return runScaffold(root, state, { options, log, forkNote: survey && freshScaffoldNote(survey) });
}

/** The three states init refuses outright, each for a different reason. */
function assertInitSupported(state: ProjectState, options: InitOptions, pristine: boolean): void {
  // Nuxt is unsupported by construction: its auto-imports leave no import
  // statements, so blueprint's static graph would be near-empty and report a
  // hollow "clean". Refuse rather than emit a false-green setup.
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

  if (options.authoring && state.hasConfig && !pristine) {
    throw new Error(
      // Not "has been edited" — a config a previous agent authored differs without
      // anyone editing it. Names what is actually lost (re-authoring rewrites rather
      // than merges, so the structure returns and the inline rationale does not) and
      // where the rescued comments go back to (field run #110).
      'blueprint.config.mjs differs from what init would scaffold — so it is yours, not '
      + 'init\'s output, and re-authoring rewrites it from scratch rather than merging. '
      + 'The structure is reproducible; the comments explaining WHY each threshold and '
      + 'ownership was chosen are not. Copy anything you want to keep, then delete the '
      + 'file yourself if you really want the playbook. Put those comments back into the '
      + 'rewritten config, each beside the clause it explains — not only into the report, '
      + 'which is read once while the config is what the next re-authoring will read.',
    );
  }
}

/** Whether this run is the one that decides what the config says. */
function configIsInitsToWrite(
  state: ProjectState,
  options: InitOptions,
  pristine: boolean,
): boolean {
  return (!state.hasConfig || Boolean(options.authoring && pristine)) && options.preset !== true;
}

/**
 * A no-srcDir Next project keeps its layers at the root — survey there so the
 * file count reflects reality, not an empty (missing) src/.
 */
function surveySource(root: string, state: ProjectState): SurveyResult {
  return runSurvey(root, {
    log: () => {},
    sourceRoot: state.hasNext && !state.nextSrcDir ? '.' : undefined,
  });
}

/**
 * Brownfield, or a Next project whose route tree cannot be placed, is read by
 * the authoring flow rather than guessed at.
 */
function takesAuthoringPath(
  state: ProjectState,
  options: InitOptions,
  survey: SurveyResult,
): boolean {
  return Boolean(options.authoring)
    || survey.totalFiles >= BROWNFIELD_MIN_FILES
    || (state.hasNext && !state.nextRouter);
}

/**
 * This fork is the biggest decision init makes — narrate it, and say plainly that
 * NO playbook is written here, or an agent told to execute blueprint-authoring.md
 * hunts for a file that does not exist.
 */
function freshScaffoldNote(survey: SurveyResult): string {
  return `Fresh scaffold (${survey.totalFiles} source files < ${BROWNFIELD_MIN_FILES}) — `
    + 'scaffolding the framework preset directly; no blueprint-authoring.md is written '
    + 'on this path. Force the authoring playbook instead with: blueprint init --authoring.';
}

/** The preset branch: resolve a config, plan every effect, then narrate applying it. */
async function runScaffold(
  root: string,
  state: ProjectState,
  ctx: RunContext & { forkNote: string | null },
): Promise<Action[]> {
  const { options } = ctx;

  // On a fresh scaffold the choice is PERSISTED into `emit.agents`, or the next
  // plain init grows the dropped contract back. An existing config still wins.
  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource } = await resolveBlueprint(root, state, {
    ...options,
    ...(agentTarget ? { scaffoldAgents: [agentTarget] } : {}),
  });

  const scanResult = scan(root, blueprint.architecture.sourceRoot);

  const actions = plan(state, blueprint, {
    ...options,
    configSource,
    agentTarget,
    hasSourceFiles: scanResult.files.length > 0,
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

/** The authoring branch: playbook + command file, then (optionally) the agent. */
function runAuthoring(
  root: string,
  state: ProjectState,
  ctx: RunContext & { survey: SurveyResult; removeScaffold: boolean },
): Action[] {
  const { options, log, survey, removeScaffold } = ctx;

  const actions = authoringActions(survey, {
    // Measured BEFORE anything is written: afterwards init cannot tell its own
    // directory, or the commands inside it, from the owner's (field run #139).
    claudeDir: claudeDirState(root),
    // The build step used to hand this question to the agent ("read your
    // tsconfig, do not assume"), which is a per-repo fact with an address.
    viteTs: viteTsCoverage(root),
    // Same family, one paragraph further on: whether that build leaves anything
    // in the working tree at all. The artifact cells asserted it did.
    tscOut: tscArtifactsOutOfTree(root),
    packageManager: state.packageManager,
    needsInstall: state.missingDeps.includes('@kekkai/blueprint'),
    install: options.install,
    next: state.hasNext,
  });

  // A pristine preset scaffold left by a plain init would mislead the
  // authoring agent (and make the playbook's final init a no-op decision).
  // It is init's own output, so removing it stays inside the trust model.
  if (removeScaffold) {
    actions.unshift({
      kind: 'rm',
      path: CONFIG_FILE,
      note: `${CONFIG_FILE} (pristine preset scaffold — removed; the playbook authors the real one)`,
    });
  }

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · brownfield without a config → authoring flow (${survey.totalFiles} source files surveyed)${
      // Below the threshold the playbook's own verdict is the early exit — said up
      // front, or the flag looks like it produced a self-refuting document. Same
      // name and number for the gate as the playbook uses (field issues #7/#8, #10).
      options.authoring && survey.totalFiles < BROWNFIELD_MIN_FILES
        ? ` — below the brownfield threshold (${BROWNFIELD_MIN_FILES} source files), forced by --authoring; the playbook's own verdict will be the early exit`
        : ''
    }`,
  );

  if (options.dryRun) {
    // Nothing is applied, so listing the whole plan up front IS the report:
    // every line reads "would", none of them claims anything about disk.
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

/**
 * The header line, then either the whole plan under `--dry-run` or the effects as
 * they land. `agentNote` is passed in already phrased: only the scaffold path can
 * say "nothing to author", and it is the one that knows why.
 */
function narrate(actions: Action[], root: string, ctx: NarrateContext): void {
  const { options, log } = ctx;

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${ctx.framework} · ${ctx.packageManager}`,
  );

  if (ctx.forkNote) {
    log(`· ${ctx.forkNote}`);
  }

  if (options.dryRun) {
    // Nothing is applied, so listing the whole plan up front IS the report:
    // every line reads "would", none of them claims anything about disk.
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

/**
 * Nothing to author on the scaffold path — but the flag still narrowed the
 * contract to that tool. Phrase it by what actually happened.
 */
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

/**
 * True when blueprint.config.mjs is byte-identical to init's own scaffold output —
 * the only config `--authoring` may take over.
 */
function isPristineScaffold(root: string, state: ProjectState): boolean {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  // A scaffold written by `init --agent` carries emit.agents — still init's
  // own byte-identical output, so each candidate gets its agent variants.
  const agentVariants: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];

  const candidates = (['vue', 'react'] as const).flatMap((framework) =>
    agentVariants.flatMap((agents) => [
      buildConfigSource(framework, state.projectName, agents),
      buildConfigSource(framework, undefined, agents),
    ]),
  );

  // undecidable: `detectNext` returns a null router for anything not Next, so this
  // is the narrowing `buildNextConfigSource` needs, not a case a test could set up.
  if (state.nextRouter) {
    for (const agents of agentVariants) {
      const next = { router: state.nextRouter, srcDir: state.nextSrcDir };

      candidates.push(
        buildNextConfigSource(next, state.projectName, agents),
        buildNextConfigSource(next, undefined, agents),
      );
    }
  }

  // `some` rather than `includes`, so a `null` text needs no guard: no candidate
  // equals null, and `includes` refusing `string | null` is the compiler's
  // requirement, not this function's.
  return candidates.some((candidate) => candidate === text);
}

/**
 * Apply the plan, announcing each effect only once it has landed — and, when one
 * throws, naming what did NOT happen before rethrowing. Printing the list up front
 * claimed edits that never reached disk when a mid-plan step failed (field #37).
 */
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
      // The only step that can leave the screen quiet, so it says so first. A
      // package manager with no route to the registry retries silently, and the
      // next line an adopter sees is nothing at all — read twice as a hung tool
      // and killed (field runs #131, #132). The escape hatch belongs here rather
      // than in the error, because the error is what never arrives.
      onInstallStarting: (action) => log(
        `  → install: ${action.note}\n`
        // The command itself, not a pointer to a flag that prints it. Killing a silent
        // install leaves whatever is on screen, and "re-run with --no-install to see the
        // command" is a round trip through the thing that just hung. Two runs then went
        // reading `node_modules/@kekkai/blueprint/package.json` for version ranges to
        // hand-write into their own — internals, for a list that does not exist: these
        // install unpinned on purpose (field runs #139, #140).
        + `      ${action.command}\n`
        + '      This is the one step that needs the registry. Silence while it works is'
        + ' normal; minutes of silence means it cannot get there — stop it and run the line'
        + ' above yourself, or re-run init with `--no-install`. No version list to find'
        + ' first: these are your project\'s dependencies, installed unpinned so eslint'
        + ' resolves to the newest supported major.\n'
        // What a killed install leaves behind: the failure path below explains the
        // half-done tree and a killed process reaches neither, so four runs stopped
        // here as invited and read the result as breakage (field runs #144–#146).
        // The install is last in the plan, so "everything above is on disk" is the
        // whole remainder, not a hopeful summary.
        // Not "what it leaves out is `package.json`": on the preset path a `✓ write:
        // package.json` sits two lines above this one (the lint script), and the two
        // read as a contradiction. What stopping omits is these packages IN it.
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

  // A deletion wearing the same ✓ as the writes around it skims past as one more
  // thing created (field issue #36). The mark says which direction the effect went.
  const mark = dryRun ? 'would' : action.kind === 'rm' ? '−' : '✓';

  return `  ${mark} ${action.kind}: ${action.note}`;
}
