import type { Blueprint } from '../config';
import { assessLintEntrypoint, loadProjectModule } from '../project';
import type { ProjectState } from '../project';
import { runLiveLint } from './lint-runtime';
import type { ScanResult } from './types';
import { wiringCheck } from './wiring';

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

  const assessment = assessLintEntrypoint(state.localPackage);

  if (!assessment.reachable || state.missingDeps.length > 0) {
    return 'unverified';
  }

  const wiring = await wiringCheck({
    root: state.applicationRoot,
    blueprint,
    scanResult,
    wired,
    merged: state.ownedEslintConfig === undefined,
    hasTypescript: state.hasTypescript,
    load: load ?? loadProjectModule,
  });

  if (wiring.status !== 'verified-alive') {
    return 'unverified';
  }

  const dependencies = [...new Set([
    ...state.localPackage.dependencies,
    ...state.toolchainPackage.dependencies,
  ])];

  const live = (lint ?? runLiveLint)(state.applicationRoot, dependencies, assessment);

  return live.status === 'passed' ? 'verified' : 'unverified';
}
