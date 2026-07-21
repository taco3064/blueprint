import type { Blueprint } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { LINT_GATED_RULE_IDS, resolveLayerFiles } from '../emit/lint/patterns';
import { dropTestFiles, globToRegExp } from './filter';
import type { ScanResult } from './types';

/**
 * How much of the repo the blueprint's enforcement actually reaches. A green
 * gate over an empty net proves nothing — these numbers make "vacuously
 * green" visible instead of leaving it to the reader's faith.
 */
export interface Coverage {
  /** Non-test source files under the source root. */
  sourceFiles: number;
  /** Of those, files matched by a declared layer's file globs. */
  layerFiles: number;
  /** Lint-gated rule ids active in `blueprint.rules` (tier not `off`). */
  activeRules: number;
  /** Total rule ids a machine can gate (see `LINT_GATED_RULE_IDS`). */
  gatedRules: number;
}

/** Measure the enforcement net: which files and how many gates reach them. */
export function computeCoverage(scanResult: ScanResult, blueprint: Blueprint): Coverage {
  const { architecture, framework, rules } = blueprint;
  const source = dropTestFiles(scanResult, architecture.testFiles).files;

  const nets = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, architecture.layerFiles, framework, architecture.sourceRoot),
      ),
    ),
  ].map(globToRegExp);

  const layerFiles = source.filter((file) => nets.some((net) => net.test(file.path))).length;

  const activeRules = LINT_GATED_RULE_IDS.filter((id) => {
    const setting = rules?.[id];
    const tier = typeof setting === 'string' ? setting : setting?.tier;

    return tier !== undefined && tier !== 'off';
  }).length;

  return {
    sourceFiles: source.length,
    layerFiles,
    activeRules,
    gatedRules: LINT_GATED_RULE_IDS.length,
  };
}

/** One-line coverage summary — loud when the net catches nothing. */
export function renderCoverage(coverage: Coverage): string {
  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0) {
    return `⚠ Enforcement is vacuous — layer globs match 0 of ${coverage.sourceFiles} source `
      + 'file(s); a green gate proves nothing until code lands inside declared layers.';
  }

  return `Coverage: ${coverage.layerFiles}/${coverage.sourceFiles} source files inside layer `
    + `nets · ${coverage.activeRules}/${coverage.gatedRules} gated rules active`;
}
