import path from 'node:path';

import { resolveArchitecture } from '../config';
import {
  AUTHORING_FILE,
  claudeDirState,
  COMMAND_FILE,
  detect,
} from '../project';
import type { RepositoryBlueprint } from '../project';
import {
  collectModuleToLayerEvidence,
  collectTransformationEvidence,
  runSurvey,
} from '../survey';
import { launchAgent } from './agent';
import { AGENT_PROMPT } from './authoring';
import { apply, defaultExec } from './apply';
import { moduleToLayerBrief } from './module-to-layer-playbook';
import { installCommand } from './plan';
import { cleanupTargets } from './playbook';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import { layerToModuleBrief } from './transformation-playbook';
import type { LayerToModuleInput } from './transformation';
import type { Action } from './types';

interface RepositoryTransformationInput extends LayerToModuleInput {
  repositoryBlueprints: RepositoryBlueprint[];
}

interface ApplicationEvidence {
  blueprint: RepositoryBlueprint;
  relativeRoot: string;
  state: ReturnType<typeof detect>;
  preflight: TransformationPreflight;
}

interface RenderContext {
  count: number;
  cleanup: string;
  current: 'layer-first' | 'module-first';
}

interface RepositoryPlaybookFacts {
  current: string;
  target: string;
  applications: string[];
  sections: string[];
  cleanup: string;
}

export async function runRepositoryTopologyTransformation(
  input: RepositoryTransformationInput,
): Promise<Action[]> {
  const repositoryRoot = input.state.repositoryRoot ?? input.state.applicationRoot;

  const applications = await Promise.all(input.repositoryBlueprints.map(async (blueprint) => {
    const state = detect(blueprint.applicationRoot);

    assertRouter(state, input.topology.current!);
    const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;

    const preflight = await runTransformationPreflight(
      blueprint.applicationRoot,
      [sourceRoot],
    );

    const relativeRoot = repositoryRelative(repositoryRoot, blueprint.applicationRoot);

    assertPreflight(preflight, relativeRoot);

    return {
      blueprint,
      relativeRoot,
      state,
      preflight,
    };
  }));

  const cleanup = cleanupTargets(claudeDirState(repositoryRoot));

  const renderContext: RenderContext = {
    count: applications.length,
    cleanup,
    current: input.topology.current!,
  };

  const sections = applications.map((application) =>
    renderApplication(application, renderContext));

  const actions: Action[] = [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: repositoryPlaybook({
        current: input.topology.current!,
        target: input.topology.target!,
        applications: applications.map((application) => application.relativeRoot),
        sections,
        cleanup,
      }),
      note: `${AUTHORING_FILE} (repository-wide topology transformation playbook)`,
    },
    {
      kind: 'write',
      path: COMMAND_FILE,
      content: `${AGENT_PROMPT}\n`,
      note: `${COMMAND_FILE} (/blueprint-author)`,
    },
    {
      kind: 'instruct',
      note: [
        `${input.topology.current} → ${input.topology.target} repository transformation preflight passed.`,
        `  ${applications.length} adopted applications are one atomic topology change.`,
        '  Read blueprint-authoring.md from the repository root and complete every application',
        '  before reporting success; a mixed intermediate tree is never a supported result.',
      ].join('\n'),
    },
  ];

  input.log(
    `blueprint ${input.options.dryRun ? 'init --dry-run' : 'init'} · `
    + `${input.topology.current} → ${input.topology.target} repository transformation `
    + `authoring (${applications.length} applications; Git preflight passed)`,
  );

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(`  would ${action.kind}: ${action.note}`);
    }

    return actions;
  }

  apply(repositoryRoot, actions, {
    // Stryker disable next-line LogicalOperator: no install action means exec is inert.
    exec: input.options.exec ?? defaultExec,
    onApplied: (action) => input.log(`  ✓ ${action.kind}: ${action.note}`),
  });

  if (input.options.agent) {
    launchAgent(input.options.agent, repositoryRoot, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }

  return actions;
}

function repositoryRelative(repositoryRoot: string, applicationRoot: string): string {
  return path.relative(repositoryRoot, applicationRoot).split(path.sep).join('/') || '.';
}

function renderApplication(
  application: ApplicationEvidence,
  context: RenderContext,
): string {
  const { blueprint, relativeRoot, state, preflight } = application;
  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const survey = runSurvey(blueprint.applicationRoot, { log: () => {}, sourceRoot });
  const install = installCommand(state.packageManager, ['@kekkai/blueprint']);

  const repositoryApplication = relativeRoot === '.'
    ? sourceRoot
    : `${relativeRoot}/${sourceRoot}`;

  if (context.current === 'layer-first') {
    return layerToModuleBrief({
      evidence: collectTransformationEvidence(
        blueprint.applicationRoot,
        survey,
        blueprint.architecture,
      ),
      preflight,
      findings: preflight.inspection.findings!,
      state,
      install,
      cleanup: context.cleanup,
      repositoryApplication,
      repositoryApplicationCount: context.count,
    });
  }

  return moduleToLayerBrief({
    evidence: collectModuleToLayerEvidence({
      root: blueprint.applicationRoot,
      survey,
      architecture: blueprint.architecture,
      nextAppRouter: state.hasNext,
    }),
    preflight,
    findings: preflight.inspection.findings!,
    state,
    install,
    cleanup: context.cleanup,
    repositoryApplication,
    repositoryApplicationCount: context.count,
  });
}

function repositoryPlaybook(facts: RepositoryPlaybookFacts): string {
  return [
    '# Blueprint repository-wide topology transformation',
    '',
    `Current repository topology: \`${facts.current}\``,
    `Target repository topology: \`${facts.target}\``,
    `Adopted applications: ${facts.applications.map((application) => `\`${application}\``).join(', ')}`,
    '',
    'This is one atomic repository transformation. Complete every application work unit before',
    'claiming success. Do not commit or report a supported state while valid configs disagree.',
    'After all movements and config cutovers, run inspect, deps, emitted ESLint, lint, typecheck,',
    'test, and build for every application. Then scan every valid blueprint.config.mjs again and',
    `prove that all resolve to \`${facts.target}\`.`,
    '',
    `Delete ${facts.cleanup} only after every application passes and the repository has one topology.`,
    '',
    ...facts.sections,
  ].join('\n\n');
}

function assertRouter(
  state: ReturnType<typeof detect>,
  current: 'layer-first' | 'module-first',
): void {
  if (!state.hasNext || state.nextRouter === 'app') {
    return;
  }

  if (current === 'layer-first' && state.nextRouter === null) {
    throw new Error(
      'Cannot verify a Next.js App Router surface for the repository-wide layer-first → '
      + 'module-first transformation. Establish the application router identity, then re-run. '
      + 'No files were changed.',
    );
  }

  throw new Error(
    `Cannot safely transform repository application ${state.applicationRoot}: its Next.js `
    + `router state is ${state.nextRouter ?? 'unresolved'}. Resolve the router identity first, `
    + 'then re-run; no files were changed.',
  );
}

function assertPreflight(preflight: TransformationPreflight, application: string): void {
  if (preflight.ok) {
    return;
  }

  const checks: [string, { ok: boolean; reason?: string }][] = [
    ['Git repository', preflight.repository],
    ['clean worktree', preflight.worktree],
    ['recoverable HEAD', preflight.head],
    ['application scope', preflight.scope],
    ['pre-transform inspection', preflight.inspection],
  ];

  const failures = checks
    .filter(([, check]) => !check.ok)
    .map(([label, check]) => `- ${application} · ${label}: ${check.reason}`);

  throw new Error(
    'Repository topology transformation preflight failed before mutation:\n'
    + `${failures.join('\n')}\nResolve every item and re-run; no files were changed.`,
  );
}
