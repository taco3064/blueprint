import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { analyze } from '../inspect/analyze';
import type { scan } from '../inspect/scan';
import type { AgentTarget, Blueprint } from '../config';
import { ignoredArtifacts } from './ignored';
import { describeUnreadable, pathAliasKeys, unreadableTsconfigs } from '../project';
import type { ProjectState } from '../project';
import type { Action } from './types';

/**
 * What init adds to the plan once the plan is built. Its own satellite because
 * every entry here exists for the same reason — an effect the action list alone
 * would not explain, or a decision nothing in the repo asked for — while
 * `plan` only ever decides the effects themselves.
 */

/** What the fresh-scaffold path adds once the plan is built, in emitted order. */
export function scaffoldNotes(
  state: ProjectState,
  blueprint: Blueprint,
  emitted: { configSource: string | null; agentTarget: AgentTarget | undefined },
): Action[] {
  return [
    ...firstAliasNote(state, blueprint, emitted.configSource),
    ...codeStyleNote(emitted.configSource),
    ...bothContractsNote(blueprint, emitted.agentTarget),
  ];
}

/**
 * A preset on a repo that never had an alias INTRODUCES one — a new convention,
 * not a detected fact. Name the decision instead of letting the choice pass as if
 * the repo had asked for it (field issue #2).
 */
function firstAliasNote(
  state: ProjectState,
  blueprint: Blueprint,
  configSource: string | null,
): Action[] {
  if (configSource === null || pathAliasKeys(state.tsconfigs).size > 0) {
    return [];
  }

  // "First alias" is a claim an unparseable tsconfig cannot support — say which
  // reading produced it, rather than letting a broken file pass as an empty one.
  const unreadable = unreadableTsconfigs(state.tsconfigs);

  return [{
    kind: 'instruct',
    note: `The preset introduced "${blueprint.architecture.alias}" as this repo's first import alias. The tilde is deliberate — '@' is npm's scope sigil (@vue/*, @types/*), and an app alias that does not look like a package scope stays visually distinct. Keep it unless the team already has its own alias convention (then set the preset's alias option and re-run init).${
      unreadable.length
        ? ` Note that ${describeUnreadable(unreadable)}, so "first" is read from the configs that could be: if an alias is declared in there, fix that file and re-run init before keeping this one.`
        : ''
    }`,
  }];
}

/**
 * The `codeStyle` landing guidance ships in the authoring playbook, which this
 * path never writes — a preset scaffold reaches `init` and stops (field run #84).
 *
 * No `codeStyle` check beside the scaffold one: a generated `configSource` always
 * comes from a preset, and every preset declares it at error tier — pinned by
 * `presets.test.ts`, so a preset that stops turns red instead of leaving this
 * note claiming a gate the adopter does not have.
 */
function codeStyleNote(configSource: string | null): Action[] {
  if (configSource === null) {
    return [];
  }

  return [{
    kind: 'instruct',
    note: 'The preset turned `codeStyle` on at error tier: it pins indent (2), quotes (single), '
      + 'semicolons (required) and line width (90) across ~68 rules. '
      + 'Nearly all are auto-fixable, so when there IS code inside a layer, run `npx eslint . '
      + '--fix` once and land that pass as its own commit — '
      + 'the formatting churn never mixes with a real change. '
      + 'While the layers are still empty that pass is a no-op: '
      + 'the gate reaches only files a layer glob matches, '
      + 'and a starter\'s root files sit outside every one of them. '
      + 'It exempts nothing by style either: a starter written without semicolons is silent '
      + 'today and fails the day its first file moves into a layer, '
      + 'which is when the --fix pass earns its commit. Already have a formatter you trust? '
      + 'Set `codeStyle: \'off\'` in the config and keep yours — '
      + 'blueprint does not need it to enforce structure.',
  }];
}

/**
 * The greenfield default emits both shared contracts — surface the
 * emit.agents narrowing the playbook itself recommends.
 */
function bothContractsNote(blueprint: Blueprint, agentTarget: AgentTarget | undefined): Action[] {
  if (blueprint.emit?.agents || agentTarget) {
    return [];
  }

  return [{
    kind: 'instruct',
    note: 'Wrote both CLAUDE.md and AGENTS.md (the default set) — '
      + 'declare emit.agents in blueprint.config.mjs, or re-run init with --agent claude|codex, '
      + 'to emit only the tool you actually use.',
  }];
}

/**
 * The contract links to the handbook and lives in the agent files — if the repo
 * gitignores them, whoever clones it gets dead links. Intentional is fine; silent
 * is not.
 */
export function gitignoreActions(
  root: string,
  blueprint: Blueprint,
  agentTarget: AgentTarget | undefined,
): Action[] {
  const targets = agentTarget ? [agentTarget] : undefined;

  const hidden = ignoredArtifacts(root, [
    handbookPath(blueprint),
    ...emitAgentFiles(blueprint, targets).map((file) => file.path),
  ]);

  if (!hidden.length) {
    return [];
  }

  // Negations win by coming later, so appending is enough — unless git excludes
  // a whole parent DIRECTORY, which a `!file` cannot re-include (field issue #4).
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');

  // The file's own line ending, or blueprint is the reason a tracked file has
  // two conventions in it.
  const eol = gitignore.includes('\r\n') ? '\r\n' : '\n';

  return [{
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
  }];
}

/**
 * Starter-template violations, phrased as a to-do. A fresh preset scaffold may
 * violate the preset out of the box (e.g. `../assets` relative imports) — say
 * exactly what to fix rather than letting the first lint run read as a broken
 * install. Only a scaffold gets this: an existing config is not init's doing.
 */
export function templateCleanupActions(
  scanResult: ReturnType<typeof scan>,
  blueprint: Blueprint,
  configSource: string | null,
): Action[] {
  if (configSource === null) {
    return [];
  }

  const findings = analyze(scanResult, blueprint).filter(
    (finding) => finding.severity === 'error',
  );

  if (!findings.length) {
    return [];
  }

  const shown = findings.slice(0, 3).map((finding) => `    ${finding.path} — ${finding.message}`);
  const more = findings.length - shown.length;

  return [{
    kind: 'instruct',
    note: [
      `Template cleanup: the starter code violates the blueprint out of the box (${findings.length} finding(s)):`,
      ...shown,
      ...(more > 0 ? [`    … and ${more} more`] : []),
      '  The alias is wired above when the template shape allowed it — replace',
      '  cross-layer relative imports with it, then verify with: npx blueprint inspect',
    ].join('\n'),
  }];
}

/**
 * The local `lint` script must reach the generated eslint config, or lint stays
 * green while the architecture goes unchecked. Fresh scaffolds get a
 * precondition-guarded patch; existing projects always get the instruction.
 */
export function lintScriptAction(
  root: string,
  blueprint: Blueprint,
  greenfield: boolean,
): Action | null {
  const file = path.join(root, 'package.json');
  const text = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(text) as { scripts?: Record<string, string> };
  const lint = parsed.scripts?.lint;

  // No special case for the project root: both arms of the ternary that used to sit
  // here answered `sourceRoot`, since the only value it special-cased was `.`.
  const target = blueprint.architecture.sourceRoot ?? 'src';

  if (lint === undefined) {
    return noLintScript(parsed, target, greenfield);
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

/**
 * No lint script at all: nothing runs the generated eslint config (field issue #1
 * — the agent invented one). On a fresh scaffold, add it; on an existing project,
 * say so instead.
 */
function noLintScript(
  parsed: { scripts?: Record<string, string> },
  target: string,
  greenfield: boolean,
): Action {
  if (!greenfield) {
    return {
      kind: 'instruct',
      note: `Your package.json has no \`lint\` script — add one so lint runs the generated rules: "lint": "eslint ${target}".`,
    };
  }

  const patched = { ...parsed, scripts: { ...parsed.scripts, lint: `eslint ${target}` } };

  return {
    kind: 'write',
    path: 'package.json',
    content: `${JSON.stringify(patched, null, 2)}\n`,
    note: `package.json (added "lint": "eslint ${target}" — so lint runs the generated rules)`,
  };
}

/**
 * The package.json patch must land BEFORE the install action — npm install
 * rewrites package.json (adding devDependencies) but preserves scripts, so
 * write-then-install composes; the reverse clobbers what npm just added.
 */
export function applyLintWiring(actions: Action[], wiring: Action | null): void {
  if (wiring === null) {
    return;
  }

  const installAt = actions.findIndex((action) => action.kind === 'install');

  if (wiring.kind === 'write' && installAt !== -1) {
    actions.splice(installAt, 0, wiring);

    return;
  }

  actions.push(wiring);
}

/** Every default agent path plus the merge targets — what plan reads to decide. */
export function contractPaths(
  blueprint: Blueprint,
  agentTarget: AgentTarget | undefined,
): string[] {
  // Merge targets plus every default agent path — the extras feed plan's stale-
  // contract cleanup, and a merge target may carry a path of its own.
  //
  // undecidable (three mutants): the `merge` filter is I/O, not behaviour — plan
  // looks this record up only at merge and default paths, so widening it changes
  // what init reads, never what init does.
  return [
    ...new Set([
      ...emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined)
        .filter((file) => file.strategy === 'merge')
        .map((file) => file.path),
      ...defaultAgentPaths().map((spec) => spec.path),
    ]),
  ];
}
