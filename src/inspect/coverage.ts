import { activeSetting } from '../config';
import type { Blueprint } from '../config';

import {
  emptyTestGlobs,
  LINT_GATED_RULE_IDS,
  resolveLayerFiles,
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

const OUTSIDE_NAMED_MAX = 5;

export function computeCoverage(
  scanResult: ScanResult,
  blueprint: Blueprint,
  hasTypescript: boolean,
): Coverage {
  const { architecture, framework, rules } = blueprint;
  const source = dropTestFiles(scanResult, architecture.testFiles).files;
  const testReach = testFileReach(scanResult, architecture.testFiles, architecture.sourceRoot);

  const nets = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, framework, architecture),
      ),
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
  const outside = coverage.outsideNets;

  const named = outside.length === 0
    ? ''
    : outside.length > OUTSIDE_NAMED_MAX
      ? ` (${outside.length} outside — too many to name; expected while layers are still empty)`
      : ` (outside: ${outside.join(', ')} — root wiring belongs here; a layer file does not)`;

  const ignored = coverage.ignoredFiles === undefined || coverage.ignoredFiles.length === 0
    ? ''
    : coverage.ignoredFiles.length > OUTSIDE_NAMED_MAX
      ? ` (${coverage.ignoredFiles.length} lint ignored — too many to name)`
      : ` (lint ignored: ${coverage.ignoredFiles.join(', ')})`;

  const reach = coverage.ignoredFiles === undefined
    ? 'source files inside layer nets'
    : 'source files reached by layer lint rules';

  return `${coverage.layerFiles}/${coverage.sourceFiles} ${reach}${ignored}${named} · `
    + `${coverage.activeRules}/${coverage.gatedRules} optional gates active `
    + '(structural boundary rules are always on)';
}

export function vacuousNextStep(blueprint: Blueprint): string {
  const { layers, sourceRoot } = blueprint.architecture;
  const root = sourceRoot ?? 'src';
  const dir = root === '.' ? `${layers[0].name}/` : `${root}/${layers[0].name}/`;

  return `next: move code into a declared layer (e.g. ${dir}) and the net arms itself`;
}

export function renderCoverage(coverage: Coverage, blueprint: Blueprint): string {
  const exemption = coverage.testExemption === undefined ? '' : `\n· ${coverage.testExemption}`;

  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0
    && (coverage.ignoredFiles?.length ?? 0) === 0) {
    return `⚠ Enforcement is vacuous — layer globs match 0 of ${coverage.sourceFiles} source `
      + `file(s); a green gate proves nothing yet — ${vacuousNextStep(blueprint)}.${exemption}`;
  }

  return `Coverage: ${coverageSummary(coverage)}${exemption}`;
}
