import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { handbookPath } from '../emit/docs';
import { analyze } from '../inspect';
import type { scan } from '../inspect';
import { resolveArchitecture } from '../config';
import type { AgentTarget, Blueprint } from '../config';
import { ignoredArtifacts } from './ignored';
import {
  assessLintEntrypoint,
  describeUnreadable,
  pathAliasKeys,
  unreadableTsconfigs,
} from '../project';
import type { ProjectState } from '../project';
import type { Action } from './types';
import {
  renderCodeStyleNote,
  renderDefaultAgentContractsNote,
  renderFirstAliasNote,
  renderGitignoreNote,
  renderGitignoreArtifactComment,
  renderLintScriptInstruction,
  renderLintScriptNote,
  renderTemplateCleanupNote,
} from '../operational-contract';

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
    note: renderFirstAliasNote({
      alias: blueprint.architecture.alias,
      ...(unreadable.length ? { unreadable: describeUnreadable(unreadable) } : {}),
    }),
  }];
}

function codeStyleNote(configSource: string | null): Action[] {
  if (configSource === null) {
    return [];
  }

  return [{
    kind: 'instruct',
    note: renderCodeStyleNote(),
  }];
}

function bothContractsNote(blueprint: Blueprint, agentTarget: AgentTarget | undefined): Action[] {
  if (blueprint.emit?.agents || agentTarget) {
    return [];
  }

  return [{
    kind: 'instruct',
    note: renderDefaultAgentContractsNote(),
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
      renderGitignoreArtifactComment(),
      ...hidden.map(({ file }) => `!${file}`),
      '',
    ].join(eol),

    note: renderGitignoreNote(
      hidden.map(({ file, rule }) => `${file} — hidden by \`${rule}\``).join('; '),
      hidden.length,
    ),
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
    note: renderTemplateCleanupNote(shown, more),
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

  const assessment = assessLintEntrypoint({
    scripts: parsed.scripts ?? {},
  });

  const target = resolveArchitecture(blueprint.architecture).sourceRoot;

  if (assessment.reachable) {
    return null;
  }

  if (lint === undefined) {
    return noLintScript(parsed, target, greenfield);
  }

  const needle = `"lint": ${JSON.stringify(lint)}`;

  if (greenfield && text.split(needle).length === 2) {
    const patched = `"lint": ${JSON.stringify(`${lint} && eslint ${target}`)}`;

    return {
      kind: 'write',
      path: 'package.json',
      content: text.replace(needle, () => patched),
      note: renderLintScriptNote('patched'),
    };
  }

  return {
    kind: 'instruct',
    note: renderLintScriptInstruction(lint, target),
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
      note: renderLintScriptInstruction(null, target),
    };
  }

  const patched = { ...parsed, scripts: { ...parsed.scripts, lint: `eslint ${target}` } };

  return {
    kind: 'write',
    path: 'package.json',
    content: `${JSON.stringify(patched, null, 2)}\n`,
    note: renderLintScriptNote('added', target),
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
