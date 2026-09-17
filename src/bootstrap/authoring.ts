import { AUTHORING_FILE } from '../project';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import {
  renderAuthoringHandoff,
  renderAuthoringInstallSkipped,
  renderAuthoringPlaybookNote,
  renderInstallNote,
} from '../operational-contract';
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
import {
  renderModuleFirstGoal,
  renderModuleFirstMethod,
  renderModuleFirstNextNote,
  renderModuleFirstSchemaSketch,
  renderModuleFirstSemantics,
} from './module-first-playbook';
import {
  BROWNFIELD_MIN_FILES,
  renderGoal,
  renderHeader,
  renderNextNote,
  renderPrerequisites,
} from './playbook';
import { renderVerdict } from './verdict';
import type { Action } from './types';
import {
  AGENT_PROMPT,
  authoringLauncherActions,
  emitsClaudeAuthoringLauncher,
} from './authoring-launcher';
import type { AuthoringAgents } from './authoring-launcher';

export { AUTHORING_FILE, COMMAND_FILE } from '../project';

export { BROWNFIELD_MIN_FILES } from './playbook';

export { AGENT_PROMPT } from './authoring-launcher';

export interface AuthoringOptions {
  packageManager: PackageManager;

  claudeDir: ClaudeDirState;

  viteTs: ViteTsCoverage | null;

  tscOut: TscArtifactLocation | null;

  needsInstall: boolean;

  install?: boolean;

  next?: boolean;

  topology?: ArchitectureTopology;

  agents?: AuthoringAgents;
}

export function authoringActions(survey: SurveyResult, options: AuthoringOptions): Action[] {
  const command = installCommand(options.packageManager, ['@kekkai/blueprint']);
  const topology = options.topology ?? 'layer-first';
  const claudeLauncher = emitsClaudeAuthoringLauncher(options.agents);

  const install: Action[] = !options.needsInstall
    ? []
    : options.install !== false
      ? [{ kind: 'install', command, note: renderInstallNote() }]
      : [{ kind: 'instruct', note: renderAuthoringInstallSkipped(command) }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: authoringBrief(survey, command, { ...options, claudeLauncher }),
      note: renderAuthoringPlaybookNote(AUTHORING_FILE),
    },
    ...authoringLauncherActions(options.agents),
    ...install,
    {
      kind: 'instruct',

      note: renderAuthoringHandoff({
        agentPrompt: AGENT_PROMPT,
        authoringFile: AUTHORING_FILE,
        claudeLauncher,
        scopeRequired: survey.scopeRequired ?? false,
        topology,
      }),
    },
  ];
}

export function forcedAuthoringExit(
  survey: SurveyResult,
  facts: { authoring?: boolean; topology: ArchitectureTopology; next: boolean },
): 'threshold' | 'runway' | null {
  if (!facts.authoring || survey.scopeRequired) {
    return null;
  }

  if (facts.topology === 'layer-first') {
    return survey.totalFiles < BROWNFIELD_MIN_FILES ? 'threshold' : null;
  }

  return survey.totalFiles === 0 && !facts.next ? 'runway' : null;
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

    claudeLauncher?: boolean;
  },
): string {
  const {
    next = false,
    claudeDir,
    viteTs = null,
    tscOut = null,
    packageManager = 'npm',
    topology = 'layer-first',
    claudeLauncher = true,
  } = facts;

  const sourceRoot = survey.sourceRoot ?? 'src';

  const playbook = topology === 'module-first'
    ? [
        renderModuleFirstGoal(),
        renderModuleFirstMethod(claudeDir, claudeLauncher),
        renderModuleFirstSemantics(),
        renderRuleCatalog(),
        renderModuleFirstSchemaSketch(sourceRoot),
      ]
    : [
        renderGoal(claudeLauncher),
        renderMethod(claudeDir, claudeLauncher),
        renderSemantics(claudeLauncher),
        renderRuleCatalog(),
        renderSchemaSketch(sourceRoot),
      ];

  return [
    renderHeader(
      topology === 'module-first' ? renderModuleFirstNextNote(next) : renderNextNote(next),
      renderVerdict(survey, {
        claudeDir,
        viteTs,
        tscOut,
        pm: packageManager,
        topology,
        claudeLauncher,
        next,
      }),
      { claudeDir, claudeLauncher },
    ),
    renderPrerequisites(install),
    ...playbook,
    renderAcceptanceGates(claudeDir, claudeLauncher),
    renderResumePoint(),
    renderSurveyEvidence(survey),
  ].join('\n');
}
