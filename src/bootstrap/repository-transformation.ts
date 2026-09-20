import path from 'node:path';

import { resolveArchitecture } from '../config';
import {
  layerToModuleBrief,
  moduleToLayerBrief,
  renderRepositoryAction,
  renderRepositoryLauncherConflictError,
  renderRepositoryNarration,
  renderRepositoryPlaybook,
  renderRepositoryPreflightError,
  renderRepositoryReady,
  renderRepositoryRouterError,
  renderTransformationObligationWriteNote,
  renderTransformationWriteNote,
} from '../operational-contract';
import {
  AUTHORING_FILE,
  writeTransformationAuthorities,
  claudeDirState,
  detect,
  retainedTransformationOrigin,
  TRANSFORMATION_OBLIGATION_FILE,
  transformationObligationSource,
} from '../project';
import type { LayerToModuleObligation, RepositoryBlueprint } from '../project';
import {
  collectModuleToLayerEvidence,
  collectTransformationEvidence,
  runSurvey,
} from '../survey';
import { launchAgent } from './agent';
import {
  claudeAuthoringLauncherActions,
  emitsClaudeAuthoringLauncher,
} from './authoring-launcher';
import { apply, defaultExec } from './apply';
import { installCommand } from './plan';
import { cleanupTargets } from './playbook';
import { runTransformationPreflight } from './preflight';
import type { TransformationPreflight } from './preflight';
import { buildTransformationObligation } from './transformation';
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

  const launcher = repositoryLauncher(repositoryRoot, input.repositoryBlueprints);

  const renderContext: RenderContext = {
    count: applications.length,
    cleanup: launcher.cleanup,
    current: input.topology.current!,
  };

  const actions: Action[] = [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: renderRepositoryPlaybook({
        current: input.topology.current!,
        target: input.topology.target!,
        applications: applications.map((application) => application.relativeRoot),
        sections: applications.map((application) => renderApplication(application, renderContext)),
        cleanup: launcher.cleanup,
      }),
      note: renderTransformationWriteNote('repository', AUTHORING_FILE),
    },
    ...(input.topology.current === 'layer-first'
      ? applications.map(repositoryObligationAction)
      : []),
    ...launcher.actions,
    {
      kind: 'instruct',
      note: renderRepositoryReady({
        current: input.topology.current!,
        target: input.topology.target!,
        applications: applications.length,
      }),
    },
  ];

  input.log(renderRepositoryNarration({
    dryRun: input.options.dryRun === true,
    current: input.topology.current!,
    target: input.topology.target!,
    applications: applications.length,
  }));

  if (input.options.dryRun) {
    for (const action of actions) {
      input.log(renderRepositoryAction(action, false));
    }

    return actions;
  }

  registerAuthorities(repositoryRoot, applications, input.topology.current!);

  apply(repositoryRoot, actions, {
    // Stryker disable next-line LogicalOperator: no install action means exec is inert.
    exec: input.options.exec ?? defaultExec,
    onApplied: (action) => input.log(renderRepositoryAction(action, true)),
  });

  if (input.options.agent) {
    launchAgent(input.options.agent, repositoryRoot, {
      log: input.log,
      spawner: input.options.spawn,
    });
  }

  return actions;
}

function registerAuthorities(
  repositoryRoot: string,
  applications: ApplicationEvidence[],
  current: 'layer-first' | 'module-first',
): void {
  if (current === 'layer-first') {
    writeTransformationAuthorities(repositoryRoot, applications.map((application) => ({
      root: application.blueprint.applicationRoot,
      obligation: JSON.parse(
        repositoryObligationAction(application).content,
      ) as LayerToModuleObligation,
    })));
  }
}

function repositoryObligationAction(
  application: ApplicationEvidence,
): Extract<Action, { kind: 'write' }> {
  const { blueprint, state, preflight, relativeRoot } = application;
  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const survey = runSurvey(blueprint.applicationRoot, { log: () => {}, sourceRoot });

  const evidence = collectTransformationEvidence(
    blueprint.applicationRoot, survey, blueprint.architecture,
  );

  const file = relativeRoot === '.'
    ? TRANSFORMATION_OBLIGATION_FILE
    : `${relativeRoot}/${TRANSFORMATION_OBLIGATION_FILE}`;

  return {
    kind: 'write',
    path: file,
    content: transformationObligationSource(buildTransformationObligation({
      state, evidence, preflight, claudeDir: claudeDirState(blueprint.applicationRoot),
    })),
    note: renderTransformationObligationWriteNote(file),
  };
}

function repositoryClaudeLauncher(blueprints: RepositoryBlueprint[]): boolean {
  const policies = [...new Set(blueprints.map((entry) =>
    emitsClaudeAuthoringLauncher(entry.blueprint.emit?.agents)))];

  if (policies.length > 1) {
    throw new Error(renderRepositoryLauncherConflictError());
  }

  return policies[0];
}

function repositoryLauncher(
  repositoryRoot: string,
  blueprints: RepositoryBlueprint[],
): { cleanup: string; actions: Action[] } {
  const claude = repositoryClaudeLauncher(blueprints);

  return {
    cleanup: cleanupTargets(claudeDirState(repositoryRoot), claude),
    actions: claudeAuthoringLauncherActions(claude),
  };
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
      origin: retainedTransformationOrigin(blueprint.applicationRoot),
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

function assertRouter(
  state: ReturnType<typeof detect>,
  current: 'layer-first' | 'module-first',
): void {
  if (!state.hasNext) {
    return;
  }

  const error = renderRepositoryRouterError({
    applicationRoot: state.applicationRoot,
    current,
    router: state.nextRouter,
  });

  if (error) {
    throw new Error(error);
  }
}

function assertPreflight(preflight: TransformationPreflight, application: string): void {
  if (preflight.ok) {
    return;
  }

  throw new Error(renderRepositoryPreflightError(preflight, application));
}
