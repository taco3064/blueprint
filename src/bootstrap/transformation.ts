import { AUTHORING_FILE, claudeDirState, COMMAND_FILE } from '../project';
import type { ClaudeDirState, ProjectState } from '../project';
import { collectTransformationEvidence, runSurvey } from '../survey';
import type { SurveyResult, TransformationEvidence } from '../survey';
import { AGENT_PROMPT } from './authoring';
import { launchAgent } from './agent';
import type { Spawner } from './agent';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import { installCommand } from './plan';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import { cleanupTargets } from './playbook';
import type { TopologyDecision } from './topology';
import { layerToModuleBrief } from './transformation-playbook';
import type { Action } from './types';

interface TransformationActionInput {
  state: ProjectState;
  evidence: TransformationEvidence;
  preflight: TransformationPreflight;
  install?: boolean;
  claudeDir: ClaudeDirState;
}

export function transformationActions(
  input: TransformationActionInput,
): Action[] {
  const { state, evidence, preflight } = input;
  const command = installCommand(state.packageManager, ['@kekkai/blueprint']);

  const install: Action[] = !state.missingDeps.includes('@kekkai/blueprint')
    ? []
    : input.install !== false
      ? [{ kind: 'install', command, note: '@kekkai/blueprint (the config imports it)' }]
      : [{
          kind: 'instruct',
          note: `Install skipped — verification requires @kekkai/blueprint, so run:\n    ${command}`,
        }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: layerToModuleBrief({
        evidence,
        preflight,
        findings: preflight.inspection.findings ?? [],
        state,
        install: command,
        cleanup: cleanupTargets(input.claudeDir),
      }),
      note: `${AUTHORING_FILE} (layer-first → module-first transformation evidence + playbook)`,
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
        'Layer-first → module-first transformation preflight passed.',
        '  The CLI measured candidates and graph evidence; domain ownership remains an Agent',
        '  decision. Read blueprint-authoring.md and execute it end to end with git mv.',
      ].join('\n'),
    },
  ];
}

export interface LayerToModuleInput {
  root: string;
  state: ProjectState;
  options: {
    install?: boolean;
    dryRun?: boolean;
    agent?: 'claude' | 'codex';
    exec?: Exec;
    spawn?: Spawner;
  };
  log: (message: string) => void;
  survey: SurveyResult | null;
  topology: TopologyDecision;
}

export async function runLayerToModuleTransformation(
  input: LayerToModuleInput,
): Promise<Action[]> {
  assertRouter(input.state);
  const preflight = await preflightFor(input);
  const survey = surveyFor(input);
  const evidence = collectTransformationEvidence(input.root, survey);

  const actions = transformationActions({
    state: input.state,
    evidence,
    preflight,
    install: input.options.install,
    claudeDir: claudeDirState(input.root),
  });

  narratePlan(input, survey, actions);

  if (!input.options.dryRun) {
    apply(input.root, actions, {
      exec: input.options.exec ?? defaultExec,
      onApplied: (action) => input.log(`  ✓ ${action.kind}: ${action.note}`),
    });

    launchRequestedAgent(input);
  }

  return actions;
}

async function preflightFor(input: LayerToModuleInput): Promise<TransformationPreflight> {
  const selected = input.topology.selectedApplication;
  const preflight = await runTransformationPreflight(input.root, selected ? [selected] : []);

  assertPreflight(preflight);

  return preflight;
}

function surveyFor(input: LayerToModuleInput): SurveyResult {
  return input.survey ?? runSurvey(input.root, {
    log: () => {},
    sourceRoot: input.topology.selectedApplication!,
  });
}

function narratePlan(input: LayerToModuleInput, survey: SurveyResult, actions: Action[]): void {
  input.log(
    `blueprint ${input.options.dryRun ? 'init --dry-run' : 'init'} · layer-first → module-first `
    + `transformation authoring (${survey.totalFiles} source files surveyed; Git preflight passed)`,
  );

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(`  would ${action.kind}: ${action.note}`);
    }
  }
}

function launchRequestedAgent(input: LayerToModuleInput): void {
  if (input.options.agent) {
    launchAgent(input.options.agent, input.root, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }
}

function assertRouter(state: ProjectState): void {
  if (!state.hasNext || state.nextRouter === 'app') {
    return;
  }

  if (state.nextRouter === null) {
    throw new Error(
      'Cannot verify a Next.js App Router surface for this layer-first → module-first '
      + 'transformation. Establish one application scope with a physical `app/**` tree, then '
      + 're-run `blueprint init --topology module-first`. No files were changed.',
    );
  }

  throw new Error(
    'Next.js Pages Router → module-first requires a framework router migration, not a '
    + 'folder-only topology transformation. Migrate to App Router separately, then re-run '
    + '`blueprint init --topology module-first`. No files were changed.',
  );
}

function assertPreflight(preflight: TransformationPreflight): void {
  if (preflight.ok) {
    return;
  }

  const failures = preflightFailures(preflight);

  throw new Error(
    'Layer-first → module-first transformation preflight failed before mutation:\n'
    + `${failures.join('\n')}\nResolve every item and re-run; no files were changed.`,
  );
}

function preflightFailures(preflight: TransformationPreflight): string[] {
  const checks: [string, { ok: boolean; reason?: string }][] = [
    ['Git repository', preflight.repository],
    ['clean worktree', preflight.worktree],
    ['recoverable HEAD', preflight.head],
    ['application scope', preflight.scope],
    ['pre-transform inspection', preflight.inspection],
  ];

  return checks.filter(([, check]) => !check.ok)
    .map(([label, check]) => `- ${label}: ${check.reason}`);
}
