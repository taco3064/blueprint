import { emitAgentFiles } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { analyze } from '../inspect/analyze';
import { scan } from '../inspect/scan';
import type { Blueprint } from '../config';
import { ignoredArtifacts } from './ignored';
import { detect, readTexts, resolveBlueprint } from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import { runSurvey } from '../survey';
import { authoringActions, BROWNFIELD_MIN_FILES } from './authoring';
import { agentTargetOf, launchAgent } from './agent';
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

    // Next.js always takes the authoring flow, file count aside: the react
    // preset would scaffold src/pages/ (a routing convention in Next) and
    // does not know the App Router's app/ tree.
    if (survey.totalFiles >= BROWNFIELD_MIN_FILES || state.hasNext) {
      return runAuthoring(root, state, survey, options, log);
    }
  }

  const { blueprint, configSource } = await resolveBlueprint(root, state, options);

  // --agent narrows the default contract targets to the one tool in use;
  // an explicit emit.agents in the config still wins.
  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const mergePaths = emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined)
    .filter((file) => file.strategy === 'merge')
    .map((file) => file.path);

  const actions = plan(state, blueprint, configSource, {
    ...options,
    agentTarget,
    existingAgentFiles: readTexts(root, mergePaths),
  });

  // Fresh preset scaffold: starter-template code may violate the preset out
  // of the box (e.g. `../assets` relative imports) — say exactly what to fix
  // rather than letting the first lint run read as a broken install.
  if (configSource !== null) {
    const cleanup = templateCleanup(root, blueprint);

    if (cleanup) actions.push(cleanup);

    if (state.hasNext) {
      // --preset forced onto a Next repo: allowed, but say why it does not fit.
      actions.push({
        kind: 'instruct',
        note: 'Warning: this is a Next.js project — the react preset scaffolds src/pages/ (a routing convention in Next) and does not declare the App Router\'s app/ tree. Prefer `blueprint init` without --preset: the authoring flow derives a config that fits (e.g. layers app → components → hooks → lib).',
      });
    }
  }

  // The contract links to the handbook and lives in the agent files — if the
  // repo gitignores them, whoever clones it gets dead links. Intentional is
  // fine; silent is not.
  const hidden = ignoredArtifacts(root, [
    handbookPath(blueprint),
    ...emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined).map((file) => file.path),
  ]);

  if (hidden.length) {
    actions.push({
      kind: 'instruct',
      note: `Heads-up: ${hidden.join(', ')} ${hidden.length === 1 ? 'is' : 'are'} gitignored — fine if intentional, but teammates cloning the repo won't have ${hidden.length === 1 ? 'it' : 'them'} (the contract links assume they exist). Regenerate anytime with: npx blueprint init`,
    });
  }

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${blueprint.framework} · ${state.packageManager}`,
  );

  for (const action of actions) {
    log(formatAction(action, Boolean(options.dryRun)));
  }

  if (!options.dryRun) {
    apply(root, actions, options.exec ?? defaultExec);

    if (options.agent) {
      // Nothing to author on this path — but the flag still narrowed the
      // contract to that tool. Phrase it by what actually happened.
      log(
        configSource === null
          ? `\n--agent ${options.agent}: nothing to author (blueprint.config.mjs exists) — no session launched; contract emitted for ${options.agent} only.`
          : `\n--agent ${options.agent}: fresh scaffold, nothing to author — no session launched; contract emitted for ${options.agent} only.`,
      );
    }
  }

  return actions;
}

/** Starter-template violations, phrased as a to-do — null when the scaffold is clean. */
function templateCleanup(root: string, blueprint: Blueprint): Action | null {
  const findings = analyze(scan(root), blueprint).filter(
    (finding) => finding.severity === 'error',
  );

  if (!findings.length) return null;

  const shown = findings.slice(0, 3).map((finding) => `    ${finding.path} — ${finding.message}`);
  const more = findings.length - shown.length;

  return {
    kind: 'instruct',
    note: [
      `Template cleanup: the starter code violates the blueprint out of the box (${findings.length} finding(s)):`,
      ...shown,
      ...(more > 0 ? [`    … and ${more} more`] : []),
      '  Wire the alias (see above), replace cross-layer relative imports with it,',
      '  then verify with: npx blueprint inspect',
    ].join('\n'),
  };
}

/** The authoring branch: playbook + command file, then (optionally) the agent. */
function runAuthoring(
  root: string,
  state: ProjectState,
  survey: ReturnType<typeof runSurvey>,
  options: InitOptions,
  log: (message: string) => void,
): Action[] {
  const actions = authoringActions(survey, {
    packageManager: state.packageManager,
    needsInstall: state.missingDeps.includes('@kekkai/blueprint'),
    install: options.install,
    next: state.hasNext,
  });

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
