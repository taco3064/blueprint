import type { AuthoringTopology } from './authoring-types';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export interface AuthoringHandoffFact {
  agentPrompt: string;
  authoringFile: string;
  claudeLauncher: boolean;
  scopeRequired: boolean;
  topology: AuthoringTopology;
}

export function renderAuthoringRoute(facts: AuthoringHandoffFact): string[] {
  if (facts.scopeRequired) {
    return [
      '  This workspace has multiple application roots: first run blueprint survey',
      '  --source-root <application-source-root>, then author that exact path as '
      + 'architecture.sourceRoot.',
      '  The current zero-file count is not a starter verdict and does not permit early exit.',
    ];
  }

  return facts.topology === 'module-first'
    ? [
        '  Module-first is selected and has no generic preset; continue the authoring method',
        '  to define its domain modules, responsibilities, and dependency direction.',
      ]
    : [
        '  An early exit the playbook prescribes IS completion; it ends by re-running init',
        '  (and locking a baseline only when debt exists).',
      ];
}

export function renderAuthoringAlternative(topology: AuthoringTopology): string[] {
  return topology === 'module-first'
    ? ['  …or follow the playbook yourself. Keep the selected module-first topology; '
      + 'there is no generic preset for its domain modules.']
    : [
        '  …or follow the playbook yourself. Prefer a preset scaffold instead? Re-run:',
        '    blueprint init --preset --topology layer-first --agent claude',
        '    # or --agent codex; plain --preset --topology layer-first as neither',
      ];
}

export function renderAuthoringHandoff(facts: AuthoringHandoffFact): OperationalText {
  return operationalText([
    'This repo has no blueprint.config.mjs — authoring one is a judgment call,',
    '  so init generated a playbook instead of guessing.',
    '  If you are the agent that ran this, keep going — do not hand back: read',
    `  ${facts.authoringFile} and execute it to the end yourself, autonomously.`,
    ...renderAuthoringRoute(facts),
    '  Driving this by hand instead? Launch a fresh agent on the playbook:',
    `    claude "${facts.agentPrompt}"${facts.claudeLauncher
      ? '     # or: /blueprint-author inside Claude Code'
      : ''}`,
    `    codex "${facts.agentPrompt}"`,
    ...renderAuthoringAlternative(facts.topology),
  ]);
}
