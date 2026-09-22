import type { Blueprint } from '../config';
import { applicationNeedsBlueprint, loadProjectModule } from '../project';
import type { ProjectState } from '../project';
import { runLiveLint } from './lint-runtime';
import { effectiveLintContext } from './doctor';
import type { ScanResult } from './types';
import { wiringCheck } from './wiring';

function hasPendingDependencies(state: ProjectState): boolean {
  return state.missingDeps.length > 0
    || applicationNeedsBlueprint(state);
}

export async function assessLintIntegration(
  state: ProjectState,
  blueprint: Blueprint,
  options: {
    scanResult: ScanResult;
    load?: typeof loadProjectModule;
    lint?: typeof runLiveLint;
  },
): Promise<'verified' | 'unverified' | 'reference-only'> {
  const { scanResult, load, lint } = options;
  const wired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  if (!wired) {
    return state.hasEslintConfig || state.legacyEslintConfig !== undefined
      ? 'reference-only'
      : 'unverified';
  }

  const dependencies = [...new Set([
    ...state.localPackage.dependencies,
    ...state.toolchainPackage.dependencies,
  ])];

  const effective = effectiveLintContext(state.applicationRoot, state);

  if (!effective.assessment.reachable || !effective.coversApplication
    || hasPendingDependencies(state)) {
    return 'unverified';
  }

  const wiring = await wiringCheck({
    root: state.applicationRoot,
    blueprint,
    scanResult,
    wired,
    // Stryker disable next-line ConditionalExpression, EqualityOperator: only unused text changes.
    merged: state.ownedEslintConfig === undefined,
    hasTypescript: state.hasTypescript,
    load: load ?? loadProjectModule,
  });

  if (wiring.status !== 'verified-alive') {
    return 'unverified';
  }

  const live = (lint ?? runLiveLint)(effective.lintRoot, dependencies, effective.assessment);

  return live.status === 'passed' ? 'verified' : 'unverified';
}
