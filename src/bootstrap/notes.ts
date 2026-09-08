import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { analyze } from '../inspect';
import type { scan } from '../inspect';
import { resolveArchitecture } from '../config';
import type { AgentTarget, Blueprint } from '../config';
import { ignoredArtifacts } from './ignored';
import { describeUnreadable, pathAliasKeys, unreadableTsconfigs } from '../project';
import type { ProjectState } from '../project';
import type { Action } from './types';

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

function firstAliasNote(
  state: ProjectState,
  blueprint: Blueprint,
  configSource: string | null,
): Action[] {
  if (configSource === null || pathAliasKeys(state.tsconfigs).size > 0) {
    return [];
  }

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

  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');

  const eol = gitignore.includes('\r\n') ? '\r\n' : '\n';

  return [{
    kind: 'write',
    path: '.gitignore',
    content: [

      gitignore.replace(/[\r\n]*$/, ''),
      '',
      '# @kekkai/blueprint artifacts — the agent contract links to these; keep them tracked',
      ...hidden.map(({ file }) => `!${file}`),
      '',
    ].join(eol),

    note: `.gitignore (re-included ${hidden
      .map(({ file, rule }) => `${file} — hidden by \`${rule}\``)
      .join('; ')} — via !; delete the appended lines to keep ${hidden.length === 1 ? 'it' : 'them'} hidden; if a parent directory is wholly excluded, git needs that directory re-included too)`,
  }];
}

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

export function lintScriptAction(
  root: string,
  blueprint: Blueprint,
  greenfield: boolean,
): Action | null {
  const file = path.join(root, 'package.json');
  const text = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(text) as { scripts?: Record<string, string> };
  const lint = parsed.scripts?.lint;

  const target = resolveArchitecture(blueprint.architecture).sourceRoot;

  if (lint === undefined) {
    return noLintScript(parsed, target, greenfield);
  }

  if (lint.includes('eslint')) {
    return null;
  }

  const needle = `"lint": ${JSON.stringify(lint)}`;

  if (greenfield && text.split(needle).length === 2) {
    const patched = `"lint": ${JSON.stringify(`${lint} && eslint ${target}`)}`;

    return {
      kind: 'write',
      path: 'package.json',
      content: text.replace(needle, () => patched),
      note: 'package.json (lint script now also runs eslint — so lint runs the generated rules)',
    };
  }

  return {
    kind: 'instruct',
    note: `Your \`lint\` script runs \`${lint}\` — the structural rules live in the generated eslint config, so lint would stay green while the architecture goes unchecked. Wire it up, e.g. "lint": "${lint} && eslint ${target}".`,
  };
}

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

export function contractPaths(
  blueprint: Blueprint,
  agentTarget: AgentTarget | undefined,
): string[] {
  return [
    ...new Set([
      // Stryker disable next-line ArrayDeclaration, MethodExpression: extras do not alter actions.
      ...emitAgentFiles(blueprint, agentTarget ? [agentTarget] : undefined)
        .filter(
          // Stryker disable next-line ConditionalExpression: non-merge files are only extra reads.
          (file) => file.strategy === 'merge',
        )
        .map((file) => file.path),
      ...defaultAgentPaths().map((spec) => spec.path),
    ]),
  ];
}
