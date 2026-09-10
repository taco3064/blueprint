import { AUTHORING_FILE, COMMAND_FILE } from '../project';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import type { ArchitectureTopology } from './topology';
import { installCommand } from './plan';
import {
  renderAcceptanceGates,
  renderResumePoint,
  renderRuleCatalog,
  renderSchemaSketch,
  renderSemantics,
  renderSurveyEvidence,
} from './catalog';
import { renderMethod } from './method';
import { renderGoal, renderHeader, renderNextNote, renderPrerequisites } from './playbook';
import { renderVerdict } from './verdict';
import type { Action } from './types';

export { AUTHORING_FILE, COMMAND_FILE } from '../project';

export { BROWNFIELD_MIN_FILES } from './playbook';

export const AGENT_PROMPT
  = `Read ${AUTHORING_FILE} at the repository root and execute it end to end.`;

export interface AuthoringOptions {
  packageManager: PackageManager;

  claudeDir: ClaudeDirState;

  viteTs: ViteTsCoverage | null;

  tscOut: TscArtifactLocation | null;

  needsInstall: boolean;

  install?: boolean;

  next?: boolean;

  topology?: ArchitectureTopology;
}

export function authoringActions(survey: SurveyResult, options: AuthoringOptions): Action[] {
  const command = installCommand(options.packageManager, ['@kekkai/blueprint']);
  const topology = options.topology ?? 'layer-first';

  const install: Action[] = !options.needsInstall
    ? []
    : options.install !== false
      ? [{ kind: 'install', command, note: '@kekkai/blueprint (the config imports it)' }]
      : [{ kind: 'instruct', note: `Install skipped — the config imports @kekkai/blueprint, so run it before authoring:\n    ${command}` }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: authoringBrief(survey, command, options),
      note: `${AUTHORING_FILE} (authoring playbook + survey evidence)`,
    },
    {
      kind: 'write',
      path: COMMAND_FILE,
      content: `${AGENT_PROMPT}\n`,
      note: `${COMMAND_FILE} (/blueprint-author)`,
    },
    ...install,
    {
      kind: 'instruct',

      note: [
        'This repo has no blueprint.config.mjs — authoring one is a judgment call,',
        '  so init generated a playbook instead of guessing.',
        '  If you are the agent that ran this, keep going — do not hand back: read',
        '  blueprint-authoring.md and execute it to the end yourself, autonomously.',
        ...authoringRoute(survey, topology),
        '  Driving this by hand instead? Launch a fresh agent on the playbook:',
        `    claude "${AGENT_PROMPT}"     # or: /blueprint-author inside Claude Code`,
        `    codex "${AGENT_PROMPT}"`,
        ...authoringAlternative(topology),
      ].join('\n'),
    },
  ];
}

function authoringRoute(
  survey: SurveyResult,
  topology: ArchitectureTopology,
): string[] {
  if (survey.scopeRequired) {
    return [
      '  This workspace has multiple application roots: first run blueprint survey',
      '  --source-root <application>/src, then author that path as architecture.sourceRoot.',
      '  The current zero-file count is not a starter verdict and does not permit early exit.',
    ];
  }

  return topology === 'module-first'
    ? [
        '  Module-first is selected and has no generic preset; continue the authoring method',
        '  to define its domain modules, responsibilities, and dependency direction.',
      ]
    : [
        '  An early exit the playbook prescribes IS completion; it ends by re-running init',
        '  (and locking a baseline only when debt exists).',
      ];
}

function authoringAlternative(topology: ArchitectureTopology): string[] {
  return topology === 'module-first'
    ? ['  …or follow the playbook yourself. Keep the selected module-first topology; '
      + 'there is no generic preset for its domain modules.']
    : [
        '  …or follow the playbook yourself. Prefer a preset scaffold instead? Re-run:',
        '    blueprint init --preset --topology layer-first --agent claude',
        '    # or --agent codex; plain --preset --topology layer-first as neither',
      ];
}

export function authoringBrief(
  survey: SurveyResult,
  install: string,

  facts: {
    next?: boolean;
    claudeDir: ClaudeDirState;
    viteTs?: ViteTsCoverage | null;
    tscOut?: TscArtifactLocation | null;

    packageManager?: PackageManager;

    topology?: ArchitectureTopology;
  },
): string {
  const {
    next = false,
    claudeDir,
    viteTs = null,
    tscOut = null,
    packageManager = 'npm',
    topology = 'layer-first',
  } = facts;

  return [
    renderHeader(
      renderNextNote(next),
      renderVerdict(survey, { claudeDir, viteTs, tscOut, pm: packageManager, topology }),
      claudeDir,
    ),
    renderPrerequisites(install),
    renderGoal(),
    renderMethod(claudeDir),
    renderSemantics(),
    renderRuleCatalog(),
    renderSchemaSketch(),
    renderAcceptanceGates(claudeDir),
    renderResumePoint(),
    renderSurveyEvidence(survey),
  ].join('\n');
}
