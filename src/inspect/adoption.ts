import type { Blueprint } from '../config';
import { applicationNeedsBlueprint, loadProjectModule } from '../project';
import type { ProjectState } from '../project';
import { runLiveLint } from './lint-runtime';
import { effectiveLintContext } from './doctor';
import type { ScanResult } from './types';
import { wiringCheck } from './wiring';
import { verifyProhibitions } from './prohibition-wiring';

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
  const { scanResult, load = loadProjectModule, lint = runLiveLint } = options;
  const wired = lintIsWired(state);

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
    load,
  });

  const prohibitions = await verifyProhibitions({
    root: state.applicationRoot, blueprint, scanResult, wired,
    lintRoot: effective.lintRoot,
    detectedFramework: state.framework,
    load,
  });

  if (wiring.status !== 'verified-alive' || prohibitions.some((fact) => fact.gate !== 'passed')) {
    return 'unverified';
  }

  const live = lint(effective.lintRoot, dependencies, effective.assessment);

  return live.status === 'passed' ? 'verified' : 'unverified';
}

function lintIsWired(state: ProjectState): boolean {
  return state.ownedEslintConfig !== undefined || state.wiredEslintConfig;
}
