import type { ArchitectureDef } from '../config';
import { AUTHORING_FILE, claudeDirState, COMMAND_FILE } from '../project';
import type { ClaudeDirState, ProjectState } from '../project';
import { collectModuleToLayerEvidence, runSurvey } from '../survey';
import type { ModuleToLayerEvidence, SurveyResult } from '../survey';
import { launchAgent } from './agent';
import type { Spawner } from './agent';
import { apply, defaultExec } from './apply';
import type { Exec } from './apply';
import { AGENT_PROMPT } from './authoring';
import { moduleToLayerBrief } from './module-to-layer-playbook';
import { installCommand } from './plan';
import { cleanupTargets } from './playbook';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import type { TopologyDecision } from './topology';
import type { Action } from './types';

interface ModuleToLayerActionInput {
  state: ProjectState;
  evidence: ModuleToLayerEvidence;
  preflight: TransformationPreflight;
  install?: boolean;
  claudeDir: ClaudeDirState;
}

export function moduleToLayerActions(input: ModuleToLayerActionInput): Action[] {
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
      content: moduleToLayerBrief({
        evidence,
        preflight,
        findings: preflight.inspection.findings ?? [],
        state,
        install: command,
        cleanup: cleanupTargets(input.claudeDir),
      }),
      note: `${AUTHORING_FILE} (module-first → layer-first mapping evidence + playbook)`,
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
        'Module-first → layer-first transformation preflight passed.',
        '  The CLI measured destinations, collisions, and graph evidence; semantic placement',
        '  remains an Agent decision. Read blueprint-authoring.md and execute it with git mv.',
      ].join('\n'),
    },
  ];
}

export interface ModuleToLayerInput {
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
  architecture: ArchitectureDef | null;
}

export async function runModuleToLayerTransformation(
  input: ModuleToLayerInput,
): Promise<Action[]> {
  const architecture = requireArchitecture(input.architecture);

  assertRouter(input.state);
  const preflight = await preflightFor(input);

  const survey = input.survey ?? runSurvey(input.root, {
    log: () => {},
    sourceRoot: input.topology.selectedApplication!,
  });

  const evidence = collectModuleToLayerEvidence({
    root: input.root,
    survey,
    architecture,
    nextAppRouter: input.state.hasNext,
  });

  const actions = moduleToLayerActions({
    state: input.state,
    evidence,
    preflight,
    install: input.options.install,
    claudeDir: claudeDirState(input.root),
  });

  input.log(
    `blueprint ${input.options.dryRun ? 'init --dry-run' : 'init'} · module-first → layer-first `
    + `transformation authoring (${survey.totalFiles} source files surveyed; Git preflight passed)`,
  );

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(`  would ${action.kind}: ${action.note}`);
    }

    return actions;
  }

  apply(input.root, actions, {
    exec: input.options.exec ?? defaultExec,
    onApplied: (action) => input.log(`  ✓ ${action.kind}: ${action.note}`),
  });

  if (input.options.agent) {
    launchAgent(input.options.agent, input.root, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }

  return actions;
}

function requireArchitecture(architecture: ArchitectureDef | null): ArchitectureDef {
  if (architecture && architecture.modules?.length) {
    return architecture;
  }

  throw new Error(
    'Module-first → layer-first transformation requires the current module-first '
    + 'blueprint.config.mjs as authority for modules, inner layers, unit layouts, aliases, and '
    + 'the module DAG. Run `blueprint init --topology module-first`, have the Agent author and '
    + 'verify the module-first config, commit the clean state, then run '
    + '`blueprint init --topology layer-first`. '
    + 'No files were changed.',
  );
}

async function preflightFor(input: ModuleToLayerInput): Promise<TransformationPreflight> {
  const selected = input.topology.selectedApplication;
  const preflight = await runTransformationPreflight(input.root, selected ? [selected] : []);

  if (!preflight.ok) {
    const checks: [string, { ok: boolean; reason?: string }][] = [
      ['Git repository', preflight.repository],
      ['clean worktree', preflight.worktree],
      ['recoverable HEAD', preflight.head],
      ['application scope', preflight.scope],
      ['pre-transform inspection', preflight.inspection],
    ];

    const failures = checks.filter(([, check]) => !check.ok)
      .map(([label, check]) => `- ${label}: ${check.reason}`);

    throw new Error(
      'Module-first → layer-first transformation preflight failed before mutation:\n'
      + `${failures.join('\n')}\nResolve every item and re-run; no files were changed.`,
    );
  }

  return preflight;
}

function assertRouter(state: ProjectState): void {
  if (!state.hasNext || state.nextRouter === 'app') {
    return;
  }

  const observed = state.nextRouter === 'both'
    ? 'both App Router and Pages Router trees'
    : state.nextRouter === 'pages'
      ? 'only a Pages Router tree'
      : 'no physical router tree';

  throw new Error(
    `Cannot safely interpret this Next.js module-first → layer-first transformation: found ${observed}. `
    + 'This path preserves one physical App Router `app/**` tree and does not choose or migrate '
    + 'router modes. Resolve the router identity first, then re-run; no files were changed.',
  );
}
