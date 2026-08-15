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
  describeUnreadable,
  detect,
  pathAliasKeys,
  readTexts,
  resolveBlueprint,
  unreadableTsconfigs,
  claudeDirState,
  tscArtifactsOutOfTree,
  viteTsCoverage,
} from '../project';
import type {
  ClaudeDirState,
  ProjectState,
  ResolveOptions,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
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

  // A config byte-identical to init's own scaffold output is init-owned, so
  // `--authoring` may take it over. A hand-edited one is the user's: refuse.
  const pristine = state.hasConfig && isPristineScaffold(root, state);

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

  // Brownfield without a config: scaffolding a preset would be a lie — the
  // layers already exist and must be *read*. Emit the authoring playbook
  // instead (an agent or a human executes it; init runs again after).
  let forkNote: string | null = null;

  if ((!state.hasConfig || (options.authoring && pristine)) && options.preset !== true) {
    // A no-srcDir Next project keeps its layers at the root — survey there so
    // the file count reflects reality, not an empty (missing) src/.
    const surveyRoot = state.hasNext && !state.nextSrcDir ? '.' : undefined;
    const survey = runSurvey(root, { log: () => {}, sourceRoot: surveyRoot });

    // Brownfield, or a Next project whose route tree cannot be placed, is read by
    // the authoring flow rather than guessed at.
    const brownfield = survey.totalFiles >= BROWNFIELD_MIN_FILES;

    if (options.authoring || brownfield || (state.hasNext && !state.nextRouter)) {
      // Measured BEFORE anything is written: afterwards init cannot tell its own
      // directory, or the commands inside it, from the owner's (field run #139).
      return runAuthoring(root, state, survey, options, log, pristine, {
        claudeDir: claudeDirState(root),
        // The build step used to hand this question to the agent ("read your
        // tsconfig, do not assume"), which is a per-repo fact with an address.
        viteTs: viteTsCoverage(root),
        // Same family, one paragraph further on: whether that build leaves anything
        // in the working tree at all. The artifact cells asserted it did.
        tscOut: tscArtifactsOutOfTree(root),
      });
    }

    // This fork is the biggest decision init makes — narrate it, and say
    // plainly that NO playbook is written here, or an agent told to execute
    // blueprint-authoring.md hunts for a file that does not exist.
    forkNote
      = `Fresh scaffold (${survey.totalFiles} source files < ${BROWNFIELD_MIN_FILES}) — `
        + 'scaffolding the framework preset directly; no blueprint-authoring.md is written '
        + 'on this path. Force the authoring playbook instead with: blueprint init --authoring.';
  }

  // On a fresh scaffold the choice is PERSISTED into `emit.agents`, or the next
  // plain init grows the dropped contract back. An existing config still wins.
  const agentTarget = options.agent ? agentTargetOf(options.agent) : undefined;

  const { blueprint, configSource } = await resolveBlueprint(root, state, {
    ...options,
    ...(agentTarget ? { scaffoldAgents: [agentTarget] } : {}),
  });

  // Merge targets plus every default agent path — the extras feed plan's stale-
  // contract cleanup, and a merge target may carry a path of its own.
  //
  // undecidable (three mutants): the `merge` filter is I/O, not behaviour — plan
  // looks this record up only at merge and default paths, so widening it changes
  // what init reads, never what init does.
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

    if (cleanup) {
      actions.push(cleanup);
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
    // Negations win by coming later, so appending is enough — unless git excludes
    // a whole parent DIRECTORY, which a `!file` cannot re-include (field issue #4).
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');

    // The file's own line ending, or blueprint is the reason a tracked file has
    // two conventions in it.
    const eol = gitignore.includes('\r\n') ? '\r\n' : '\n';

    actions.push({
      kind: 'write',
      path: '.gitignore',
      content: [
        // How many trailing newlines the file carried is an editor accident —
        // normalised to exactly one blank line before the appended block.
        gitignore.replace(/[\r\n]*$/, ''),
        '',
        '# @kekkai/blueprint artifacts — the agent contract links to these; keep them tracked',
        ...hidden.map(({ file }) => `!${file}`),
        '',
      ].join(eol),
      // Name the rule that hid each file, not only the file: checked after the
      // negation lands, `git check-ignore` answers "not ignored" and reads as
      // evidence the fix was a no-op.
      note: `.gitignore (re-included ${hidden
        .map(({ file, rule }) => `${file} — hidden by \`${rule}\``)
        .join('; ')} — via !; delete the appended lines to keep ${hidden.length === 1 ? 'it' : 'them'} hidden; if a parent directory is wholly excluded, git needs that directory re-included too)`,
    });
  }

  // The package.json patch must land BEFORE the install action — npm install
  // rewrites package.json (adding devDependencies) but preserves scripts, so
  // write-then-install composes; the reverse clobbers what npm just added.
  const lintWiring = lintScriptAction(root, blueprint, configSource !== null);

  if (lintWiring) {
    const installAt = actions.findIndex((action) => action.kind === 'install');

    if (lintWiring.kind === 'write' && installAt !== -1) {
      actions.splice(installAt, 0, lintWiring);
    } else {
      actions.push(lintWiring);
    }
  }

  // A preset on a repo that never had an alias INTRODUCES one — a new
  // convention, not a detected fact. Name the decision instead of letting
  // the choice pass as if the repo had asked for it (field issue #2).
  if (configSource !== null && pathAliasKeys(state.tsconfigs).size === 0) {
    // "First alias" is a claim an unparseable tsconfig cannot support — say which
    // reading produced it, rather than letting a broken file pass as an empty one.
    const unreadable = unreadableTsconfigs(state.tsconfigs);

    actions.push({
      kind: 'instruct',
      note: `The preset introduced "${blueprint.architecture.alias}" as this repo's first import alias. The tilde is deliberate — '@' is npm's scope sigil (@vue/*, @types/*), and an app alias that does not look like a package scope stays visually distinct. Keep it unless the team already has its own alias convention (then set the preset's alias option and re-run init).${
        unreadable.length
          ? ` Note that ${describeUnreadable(unreadable)}, so "first" is read from the configs that could be: if an alias is declared in there, fix that file and re-run init before keeping this one.`
          : ''
      }`,
    });
  }

  // The `codeStyle` landing guidance ships in the authoring playbook, which this
  // path never writes — a preset scaffold reaches `init` and stops (field run #84).
  //
  // No `codeStyle` check beside the scaffold one: a generated `configSource` always
  // comes from a preset, and every preset declares it at error tier — pinned by
  // `presets.test.ts`, so a preset that stops turns red instead of leaving this
  // note claiming a gate the adopter does not have.
  if (configSource !== null) {
    actions.push({
      kind: 'instruct',
      note: 'The preset turned `codeStyle` on at error tier: it pins indent (2), quotes (single), semicolons (required) and line width (90) across ~68 rules. Nearly all are auto-fixable, so when there IS code inside a layer, run `npx eslint . --fix` once and land that pass as its own commit — the formatting churn never mixes with a real change. While the layers are still empty that pass is a no-op: the gate reaches only files a layer glob matches, and a starter\'s root files sit outside every one of them. It exempts nothing by style either: a starter written without semicolons is silent today and fails the day its first file moves into a layer, which is when the --fix pass earns its commit. Already have a formatter you trust? Set `codeStyle: \'off\'` in the config and keep yours — blueprint does not need it to enforce structure.',
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

  if (forkNote) {
    log(`· ${forkNote}`);
  }

  if (options.dryRun) {
    // Nothing is applied, so listing the whole plan up front IS the report:
    // every line reads "would", none of them claims anything about disk.
    for (const action of actions) {
      log(formatAction(action, true));
    }
  }

  if (!options.dryRun) {
    applyAndNarrate(root, actions, options.exec ?? defaultExec, log);

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
 * True when blueprint.config.mjs is byte-identical to init's own scaffold output —
 * the only config `--authoring` may take over.
 */
function isPristineScaffold(root: string, state: ProjectState): boolean {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  // A scaffold written by `init --agent` carries emit.agents — still init's
  // own byte-identical output, so each candidate gets its agent variants.
  const agentVariants = [undefined, ['claude' as const], ['agents' as const]];

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
      candidates.push(
        buildNextConfigSource(state.nextRouter, state.nextSrcDir, state.projectName, agents),
        buildNextConfigSource(state.nextRouter, state.nextSrcDir, undefined, agents),
      );
    }
  }

  // `some` rather than `includes`, so a `null` text needs no guard: no candidate
  // equals null, and `includes` refusing `string | null` is the compiler's
  // requirement, not this function's.
  return candidates.some((candidate) => candidate === text);
}

/**
 * The local `lint` script must reach the generated eslint config, or lint stays
 * green while the architecture goes unchecked. Fresh scaffolds get a
 * precondition-guarded patch; existing projects always get the instruction.
 */
function lintScriptAction(root: string, blueprint: Blueprint, greenfield: boolean): Action | null {
  const file = path.join(root, 'package.json');
  const text = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(text) as { scripts?: Record<string, string> };
  const lint = parsed.scripts?.lint;

  // No special case for the project root: both arms of the ternary that used to sit
  // here answered `sourceRoot`, since the only value it special-cased was `.`.
  const target = blueprint.architecture.sourceRoot ?? 'src';

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

  if (lint.includes('eslint')) {
    return null;
  }

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

  if (!findings.length) {
    return null;
  }

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
  // No default: the one caller always decides, so a default here would be a value
  // nothing ever reads — dead on arrival and invisible to every test.
  removeScaffold: boolean,
  facts: {
    claudeDir: ClaudeDirState;
    viteTs: ViteTsCoverage | null;
    tscOut: TscArtifactLocation | null;
  },
): Action[] {
  const actions = authoringActions(survey, {
    ...facts,
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
      // Below the threshold the playbook's own verdict is the early exit — said up
      // front, or the flag looks like it produced a self-refuting document. Same
      // name and number for the gate as the playbook uses (field issues #7/#8, #10).
      forced
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
  }

  if (!options.dryRun) {
    applyAndNarrate(root, actions, options.exec ?? defaultExec, log);

    if (options.agent) {
      launchAgent(options.agent, root, log, options.spawn);
    }
  }

  return actions;
}

/**
 * Apply the plan, announcing each effect only once it has landed — and, when one
 * throws, naming what did NOT happen before rethrowing. Printing the list up front
 * claimed edits that never reached disk when a mid-plan step failed (field #37).
 */
function applyAndNarrate(
  root: string,
  actions: Action[],
  exec: Exec,
  log: (line: string) => void,
): void {
  let landed = 0;

  try {
    apply(
      root,
      actions,
      exec,
      (action) => {
        landed += 1;
        log(formatAction(action, false));
      },
      // The only step that can leave the screen quiet, so it says so first. A
      // package manager with no route to the registry retries silently, and the
      // next line an adopter sees is nothing at all — read twice as a hung tool
      // and killed (field runs #131, #132). The escape hatch belongs here rather
      // than in the error, because the error is what never arrives.
      (action) => log(
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
    );
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
      + '`blueprint init --no-install` — the dependency list is then printed for you to install yourself.',
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
