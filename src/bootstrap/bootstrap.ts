import { emitAgentFiles } from '../emit/agent';
import { detect, readTexts, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { runSurvey } from '../survey';
import { authoringActions, BROWNFIELD_MIN_FILES } from './authoring';
import { launchAgent } from './agent';
import type { AgentKind, Spawner } from './agent';
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
  /** Launch this agent CLI on the authoring playbook after writing it. */
  agent?: AgentKind;
  /** Dependency install runner (default `execSync`). */
  exec?: Exec;
  /** Agent-CLI spawn runner (default `spawnSync`, stdio inherited). */
  spawn?: Spawner;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** Run `blueprint init` in `root`. Returns the planned actions (for tests / dry-run). */
export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  // Brownfield without a config: scaffolding a preset would be a lie — the
  // layers already exist and must be *read*. Emit the authoring playbook
  // instead (an agent or a human executes it; init runs again after).
  if (!state.hasConfig && options.preset !== true) {
    const survey = runSurvey(root, { log: () => {} });

    if (survey.totalFiles >= BROWNFIELD_MIN_FILES) {
      return runAuthoring(root, survey, options, log);
    }
  }

  const { blueprint, configSource } = await resolveBlueprint(root, state, options);

  const mergePaths = emitAgentFiles(blueprint)
    .filter((file) => file.strategy === 'merge')
    .map((file) => file.path);

  const actions = plan(state, blueprint, configSource, {
    ...options,
    existingAgentFiles: readTexts(root, mergePaths),
  });

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${blueprint.framework} · ${state.packageManager}`,
  );

  for (const action of actions) {
    log(formatAction(action, Boolean(options.dryRun)));
  }

  if (!options.dryRun) {
    apply(root, actions, options.exec ?? defaultExec);

    if (options.agent) {
      // A config already existed, so there is nothing to author — say so
      // instead of silently ignoring the flag.
      log(`\n--agent ${options.agent} skipped: blueprint.config.mjs already exists; the agent flow authors one on brownfield repos.`);
    }
  }

  return actions;
}

/** The authoring branch: playbook + command file, then (optionally) the agent. */
function runAuthoring(
  root: string,
  survey: ReturnType<typeof runSurvey>,
  options: InitOptions,
  log: (message: string) => void,
): Action[] {
  const actions = authoringActions(survey);

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · brownfield without a config → authoring flow (${survey.totalFiles} source files surveyed)`,
  );

  for (const action of actions) {
    log(formatAction(action, Boolean(options.dryRun)));
  }

  if (!options.dryRun) {
    apply(root, actions, options.exec ?? defaultExec);

    if (options.agent) {
      launchAgent(options.agent, root, log, options.spawn);
    }
  }

  return actions;
}

function formatAction(action: Action, dryRun: boolean): string {
  if (action.kind === 'instruct') {
    return `  · ${action.note}`;
  }

  return `  ${dryRun ? 'would' : '✓'} ${action.kind}: ${action.note}`;
}
