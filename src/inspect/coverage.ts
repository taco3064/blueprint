import { activeSetting, resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import {
  renderCoverageReport,
  renderCoverageSummary,
  renderVacuousNextStep,
} from '../operational-contract';

import {
  emptyTestGlobs,
  LINT_GATED_RULE_IDS,
  toArray,
  unavailableGate,
  unreachedTestGlobs,
} from '../emit/lint/patterns';
import type { TestGlobReach } from '../emit/lint/patterns';
import { dropLayerFilesIgnored, dropTestFiles, globToRegExp, isTestFile } from './filter';
import { outsideScanReach } from './scan';
import type { ScanResult } from './types';
import { syntheticProbePaths } from './wiring';

export interface Coverage {

  sourceFiles: number;

  layerFiles: number;

  outsideNets: string[];

  ignoredFiles?: string[];

  activeRules: number;

  gatedRules: number;

  testExemption?: string;
}

export function testFileReach(
  scanResult: ScanResult,
  testFiles: string | string[] | undefined,
  sourceRoot: string | undefined,
): TestGlobReach[] {
  return toArray(testFiles).map((glob) => {
    const patterns = [globToRegExp(glob)];
    const unreached = outsideScanReach(glob, sourceRoot);

    return {
      glob,
      matched: scanResult.files.filter((file) => isTestFile(file.path, patterns)).length,
      ...(unreached === null ? {} : { unreached }),
    };
  });
}

export function unreachedIgnoreGlobs(scanResult: ScanResult, blueprint: Blueprint): string[] {
  const declared = toArray(blueprint.architecture.layerFilesIgnore);

  return declared.filter((glob, index) => {
    const pattern = globToRegExp(glob);

    const standIns = syntheticProbePaths(blueprint, scanResult, [
      // Stryker disable next-line MethodExpression: file-reaching entries fail below.
      ...declared.slice(0, index),
      // Stryker disable next-line MethodExpression, ArithmeticOperator: file hits fail below.
      ...declared.slice(index + 1),
    ]);

    return !scanResult.files.some((file) => pattern.test(file.path))
      && !standIns.some((candidate) => pattern.test(candidate));
  });
}

export function computeCoverage(
  scanResult: ScanResult,
  blueprint: Blueprint,
  hasTypescript: boolean,
): Coverage {
  const { architecture, framework, rules } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const source = dropTestFiles(scanResult, architecture.testFiles).files;
  const testReach = testFileReach(scanResult, architecture.testFiles, resolved.sourceRoot);

  const nets = [
    ...new Set(
      [
        ...resolved.containerFiles(framework),
        ...resolved.layers.flatMap((layer) => resolved.layerFiles(layer.name, framework)),
      ],
    ),
  ].map(globToRegExp);

  const outside = source.filter((file) => !nets.some((net) => net.test(file.path)));

  const inside = { ...scanResult, files: source.filter((file) =>
    nets.some((net) => net.test(file.path))) };

  const reached = dropLayerFilesIgnored(inside, architecture.layerFilesIgnore).files;
  const ignored = inside.files.filter((file) => !reached.includes(file));

  const gates = LINT_GATED_RULE_IDS
    .filter((id) => unavailableGate(
      id,
      { framework, hasTypescript, testFiles: architecture.testFiles },
    ) === null);

  const activeRules = gates.filter((id) => activeSetting(rules?.[id]) !== null).length;

  const testExemption = unreachedTestGlobs(testReach) ?? emptyTestGlobs(architecture.testFiles);

  return {
    sourceFiles: source.length,
    layerFiles: reached.length,
    outsideNets: outside.map((file) => file.path),
    ...(ignored.length ? { ignoredFiles: ignored.map((file) => file.path) } : {}),
    activeRules,
    gatedRules: gates.length,
    ...(testExemption === null ? {} : { testExemption }),
  };
}

export function coverageSummary(coverage: Coverage): string {
  return renderCoverageSummary(coverage);
}

export function vacuousNextStep(blueprint: Blueprint): string {
  const architecture = resolveArchitecture(blueprint.architecture);
  const position = architecture.layerPositions[0];

  return renderVacuousNextStep({
    topology: architecture.topology,
    directory: position ? `${position.root}/` : null,
  });
}

export function renderCoverage(coverage: Coverage, blueprint: Blueprint): string {
  return renderCoverageReport(coverage, vacuousNextStep(blueprint));
}
