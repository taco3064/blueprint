import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { analyze } from '../inspect/analyze';
import { scan } from '../inspect/scan';
import type { Blueprint } from '../config';
import { ignoredArtifacts } from './ignored';
import {
  buildConfigSource,
  buildNextConfigSource,
  CONFIG_FILE,
  detect,
  pathAliasKeys,
  readTexts,
  resolveBlueprint,
} from '../project';
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
  /**
   * Force the authoring playbook even on a small repo (below the file-count
   * threshold that would otherwise scaffold a preset). The symmetric escape
   * hatch to `--preset`: an agent told to execute blueprint-authoring.md can
   * guarantee the file is written. Mutually exclusive with `preset`.
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

/** Run `blueprint init` in `root`. Returns the planned actions (for tests / dry-run). */
export async function runInit(root: string, options: InitOptions = {}): Promise<Action[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

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

  // `--authoring` after a plain init used to be a silent no-op: the scaffolded
  // preset config made hasConfig true and the fork below never ran. A config
  // that is byte-identical to init's own scaffold output is init-owned — safe
  // for --authoring to take over. A hand-edited one is the user's: refuse.
  const pristine = state.hasConfig && isPristineScaffold(root, state);

  if (options.authoring && state.hasConfig && !pristine) {
    throw new Error(
      'blueprint.config.mjs exists and has been edited — re-authoring would discard '
      + 'your work. Delete the file yourself if you really want the playbook.',
    );
  }

  // Brownfield without a config: scaffolding a preset would be a lie — the
  // layers already exist and must be *read*. Emit the authoring playbook
  // instead (an agent or a human executes it; init runs again after).
  let forkNote: string | null = null;

  if ((!state.hasConfig || (options.authoring && pristine)) && options.preset !== true) {
    // A no-srcDir Next project keeps its layers at the root — survey there so
    // the file count reflects reality, not an empty (missing) src/.
    const surveyRoot = state.hasNext && !state.nextSrcDir ? '.' : undefined;
    const survey = runSurvey(root, { log: () => {}, sourceRoot: surveyRoot });

    // Greenfield Next with a detected router uses nextPreset (below). Anything
    // brownfield — or a Next project whose route tree we cannot place — is read
    // by the authoring flow, never guessed. `--authoring` forces it regardless
    // of file count, so an agent can guarantee the playbook is written.
    const brownfield = survey.totalFiles >= BROWNFIELD_MIN_FILES;

    if (options.authoring || brownfield || (state.hasNext && !state.nextRouter)) {
      return runAuthoring(root, state, survey, options, log, pristine);
    }

    // This fork is the biggest decision init makes — narrate it, and say
    // plainly that NO playbook is written here, or an agent told to execute
    // blueprint-authoring.md hunts for a file that does not exist.
    forkNote
      = `Fresh scaffold (${survey.totalFiles} source files < ${BROWNFIELD_MIN_FILES}) — `
        + 'scaffolding the framework preset directly; no blueprint-authoring.md is written '
        + 'on this path. Force the authoring playbook instead with: blueprint init --authoring.';
  }

  // --agent narrows the contract targets to the one tool in use — and on a
  // fresh scaffold the choice is PERSISTED into the generated config's
  // emit.agents, so the next plain init does not grow the second contract
  // back (field issue #5). An explicit emit.agents in an existing config
  // still wins.
  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource } = await resolveBlueprint(root, state, {
    ...options,
    ...(agentTarget ? { scaffoldAgents: [agentTarget] } : {}),
  });

  // Read the merge targets init will write into, plus every default agent
  // path — the extras feed plan's stale-contract cleanup.
  const agentPaths = [
    ...new Set([
      ...emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined)
        .filter((file) => file.strategy === 'merge')
        .map((file) => file.path),
      ...defaultAgentPaths().map((spec) => spec.path),
    ]),
  ];

  const scanResult = scan(root, blueprint.architecture.sourceRoot);

  const actions = plan(state, blueprint, configSource, {
    ...options,
    agentTarget,
    hasSourceFiles: scanResult.files.length > 0,
    existingAgentFiles: readTexts(root, agentPaths),
  });

  // Fresh preset scaffold: starter-template code may violate the preset out
  // of the box (e.g. `../assets` relative imports) — say exactly what to fix
  // rather than letting the first lint run read as a broken install.
  if (configSource !== null) {
    const cleanup = templateCleanup(scanResult, blueprint);

    if (cleanup) actions.push(cleanup);
  }

  // The contract links to the handbook and lives in the agent files — if the
  // repo gitignores them, whoever clones it gets dead links. Intentional is
  // fine; silent is not.
  const hidden = ignoredArtifacts(root, [
    handbookPath(blueprint),
    ...emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined).map((file) => file.path),
  ]);

  if (hidden.length) {
    // The heads-up used to hand the fix back to the user; init wires the
    // alias into user configs already, so it can wire this too (field
    // issue #4). Negations win by coming later — appending is enough,
    // unless git excludes a whole parent DIRECTORY, which a `!file` cannot
    // re-include; the note says so instead of pretending.
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');

    actions.push({
      kind: 'write',
      path: '.gitignore',
      content: `${gitignore.replace(/\n*$/, '\n')}\n# @kekkai/blueprint artifacts — the agent contract links to these; keep them tracked\n${hidden.map((file) => `!${file}`).join('\n')}\n`,
      note: `.gitignore (re-included ${hidden.join(', ')} via ! — delete the lines to keep ${hidden.length === 1 ? 'it' : 'them'} hidden; if a parent directory is wholly excluded, git needs that directory re-included too)`,
    });
  }

  // The package.json patch must land BEFORE the install action — npm install
  // rewrites package.json (adding devDependencies) but preserves scripts, so
  // write-then-install composes; the reverse clobbers what npm just added.
  const lintWiring = lintScriptAction(root, blueprint, configSource !== null);

  if (lintWiring) {
    const installAt = actions.findIndex((action) => action.kind === 'install');

    if (lintWiring.kind === 'write' && installAt !== -1) actions.splice(installAt, 0, lintWiring);
    else actions.push(lintWiring);
  }

  // A preset on a repo that never had an alias INTRODUCES one — a new
  // convention, not a detected fact. Name the decision instead of letting
  // the choice pass as if the repo had asked for it (field issue #2).
  if (configSource !== null && pathAliasKeys(state.tsconfigs).size === 0) {
    actions.push({
      kind: 'instruct',
      note: `The preset introduced "${blueprint.architecture.alias}" as this repo's first import alias. The tilde is deliberate — '@' is npm's scope sigil (@vue/*, @types/*), and an app alias that does not look like a package scope stays visually distinct. Keep it unless the team already has its own alias convention (then set the preset's alias option and re-run init).`,
    });
  }

  // The greenfield default emits both shared contracts — surface the
  // emit.agents narrowing the playbook itself recommends.
  if (!blueprint.emit?.agents && !agentTarget) {
    actions.push({
      kind: 'instruct',
      note: 'Wrote both CLAUDE.md and AGENTS.md (the default set) — declare emit.agents in blueprint.config.mjs, or re-run init with --agent claude|codex, to emit only the tool you actually use.',
    });
  }

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · ${blueprint.framework} · ${state.packageManager}`,
  );

  if (forkNote) log(`· ${forkNote}`);

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
/**
 * True when blueprint.config.mjs is byte-identical to what init itself would
 * scaffold today — i.e. never hand-edited. Only such a config may be taken
 * over by `--authoring`; anything else belongs to the user.
 */
function isPristineScaffold(root: string, state: ProjectState): boolean {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  /* v8 ignore next 2 -- hasConfig guarantees the file exists; null only on a read race */
  if (text === null) return false;

  // A scaffold written by `init --agent` carries emit.agents — still init's
  // own byte-identical output, so each candidate gets its agent variants.
  const agentVariants = [undefined, ['claude' as const], ['agents' as const]];

  const candidates = (['vue', 'react'] as const).flatMap((framework) =>
    agentVariants.flatMap((agents) => [
      buildConfigSource(framework, state.projectName, agents),
      buildConfigSource(framework, undefined, agents),
    ]),
  );

  if (state.hasNext && state.nextRouter) {
    for (const agents of agentVariants) {
      candidates.push(
        buildNextConfigSource(state.nextRouter, state.nextSrcDir, state.projectName, agents),
        buildNextConfigSource(state.nextRouter, state.nextSrcDir, undefined, agents),
      );
    }
  }

  return candidates.includes(text);
}

/**
 * The local `lint` script must reach the generated eslint config, or the
 * structural rules never actually run (e.g. a template whose `lint` runs
 * oxlint only) — lint stays green while the architecture goes unchecked.
 * Fresh scaffolds get a precondition-guarded text patch — the exact
 * `"lint": "…"` pair must appear once, or we fall back to the instruction;
 * existing projects always get the instruction.
 */
function lintScriptAction(root: string, blueprint: Blueprint, greenfield: boolean): Action | null {
  const file = path.join(root, 'package.json');
  const text = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(text) as { scripts?: Record<string, string> };
  const lint = parsed.scripts?.lint;

  const sourceRoot = blueprint.architecture.sourceRoot ?? 'src';
  const target = sourceRoot === '.' ? '.' : sourceRoot;

  // No lint script at all: nothing runs the generated eslint config (field
  // issue #1 — the agent invented one). On a fresh scaffold, add it; on an
  // existing project, say so instead.
  if (lint === undefined) {
    if (greenfield) {
      const patched = { ...parsed, scripts: { ...parsed.scripts, lint: `eslint ${target}` } };

      return {
        kind: 'write',
        path: 'package.json',
        content: `${JSON.stringify(patched, null, 2)}\n`,
        note: `package.json (added "lint": "eslint ${target}" — so lint runs the generated rules)`,
      };
    }

    return {
      kind: 'instruct',
      note: `Your package.json has no \`lint\` script — add one so lint runs the generated rules: "lint": "eslint ${target}".`,
    };
  }

  if (lint.includes('eslint')) return null;

  const needle = `"lint": ${JSON.stringify(lint)}`;

  if (greenfield && text.split(needle).length === 2) {
    return {
      kind: 'write',
      path: 'package.json',
      content: text.replace(needle, `"lint": ${JSON.stringify(`${lint} && eslint ${target}`)}`),
      note: 'package.json (lint script now also runs eslint — so lint runs the generated rules)',
    };
  }

  return {
    kind: 'instruct',
    note: `Your \`lint\` script runs \`${lint}\` — the structural rules live in the generated eslint config, so lint would stay green while the architecture goes unchecked. Wire it up, e.g. "lint": "${lint} && eslint ${target}".`,
  };
}

function templateCleanup(scanResult: ReturnType<typeof scan>, blueprint: Blueprint): Action | null {
  const findings = analyze(scanResult, blueprint).filter(
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
      '  The alias is wired above when the template shape allowed it — replace',
      '  cross-layer relative imports with it, then verify with: npx blueprint inspect',
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
  removeScaffold = false,
): Action[] {
  const actions = authoringActions(survey, {
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

  const forced = options.authoring && survey.totalFiles < BROWNFIELD_MIN_FILES;

  log(
    `blueprint ${options.dryRun ? 'init --dry-run' : 'init'} · brownfield without a config → authoring flow (${survey.totalFiles} source files surveyed)${
      // --authoring below the threshold writes a playbook whose own verdict
      // is the early exit — say so up front, or the flag looks like it
      // produced a self-refuting document (field issues #7/#8). One name and
      // one number for the gate everywhere — the playbook calls it the
      // brownfield threshold, so the CLI does too (field run #10).
      forced
        ? ` — below the brownfield threshold (${BROWNFIELD_MIN_FILES} source files), forced by --authoring; the playbook's own verdict will be the early exit`
        : ''
    }`,
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
