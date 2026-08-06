import { activeSetting } from '../config';
import type { Blueprint } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { LINT_GATED_RULE_IDS, resolveLayerFiles, unavailableGate } from '../emit/lint/patterns';
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
  /**
   * The ones NOT matched, by path.
   *
   * The count alone is a claim the reader cannot check: `272/275` is correct both when
   * the three are root wiring (`main.tsx`, `router.js` — outside every layer by design)
   * and when one is a layer file a mistyped glob dropped out of the net. A field agent
   * confirmed the glob by other means (`impact` running on layer files, then
   * `print-config`) and said the number itself was not what told it.
   */
  outsideNets: string[];
  /** Lint-gated rule ids active in `blueprint.rules` (tier not `off`). */
  activeRules: number;
  /** Total rule ids a machine can gate (see `LINT_GATED_RULE_IDS`). */
  gatedRules: number;
}

/** Beyond this many files outside the nets, the list stops being readable. */
const OUTSIDE_NAMED_MAX = 5;

/**
 * Measure the enforcement net: which files and how many gates reach them.
 * `hasTypescript` comes from `detect` — it decides whether `explicitAny` is a
 * gate here at all (see the filter below).
 */
export function computeCoverage(
  scanResult: ScanResult,
  blueprint: Blueprint,
  hasTypescript: boolean,
): Coverage {
  const { architecture, framework, rules } = blueprint;
  const source = dropTestFiles(scanResult, architecture.testFiles).files;

  const nets = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, architecture.layerFiles, framework, architecture.sourceRoot),
      ),
    ),
  ].map(globToRegExp);

  const outside = source.filter((file) => !nets.some((net) => net.test(file.path)));
  const layerFiles = source.length - outside.length;

  // A gate you cannot open is not a gate, and which those are now lives in one
  // place: this filter and `blueprint rules`' own mirror of it had drifted, so a JS
  // repo read a denominator of 17 here against eighteen rows there (field run #137).
  // The two stylistic gates are NOT among them — every stack can open those; whether
  // the config injects the plugin is a wiring fact this cannot see.
  const gates = LINT_GATED_RULE_IDS
    .filter((id) => unavailableGate(id, framework, hasTypescript) === null);

  const activeRules = gates.filter((id) => activeSetting(rules?.[id]) !== null).length;

  return {
    sourceFiles: source.length,
    layerFiles,
    outsideNets: outside.map((file) => file.path),
    activeRules,
    gatedRules: gates.length,
  };
}

/**
 * The shared one-line summary — inspect's footer and doctor's detail both
 * read from here so the numbers never phrase themselves two ways. The gate
 * count is labeled *optional*: the structural boundary rules (restricted
 * imports, relative escapes, ownership) are always emitted regardless of the
 * `rules` block, so "0 optional gates" must not read as "nothing enforced".
 */
export function coverageSummary(coverage: Coverage): string {
  // The files outside the net are NAMED, not just counted. Root wiring belongs out
  // there and a layer file dropped by a mistyped glob does not, and the count reads
  // identically either way — so the number is a claim its reader cannot check. Capped,
  // because on a brownfield repo mid-adoption the list is the whole repo: past the cap
  // the count is the honest answer and the names would be noise.
  const outside = coverage.outsideNets;

  const named = outside.length === 0
    ? ''
    : outside.length > OUTSIDE_NAMED_MAX
      ? ` (${outside.length} outside — too many to name; expected while layers are still empty)`
      : ` (outside: ${outside.join(', ')} — root wiring belongs here; a layer file does not)`;

  return `${coverage.layerFiles}/${coverage.sourceFiles} source files inside layer nets${named} · `
    + `${coverage.activeRules}/${coverage.gatedRules} optional gates active `
    + '(structural boundary rules are always on)';
}

/**
 * The concrete step that arms a vacuous net, named with a real declared
 * layer. "Wired but proves nothing yet" is a tension every vacuous callout
 * carries — stating what closes the gap keeps it from reading as a
 * contradiction of "adoption complete".
 */
export function vacuousNextStep(blueprint: Blueprint): string {
  const { layers, sourceRoot } = blueprint.architecture;
  const root = sourceRoot ?? 'src';
  const dir = root === '.' ? `${layers[0].name}/` : `${root}/${layers[0].name}/`;

  return `next: move code into a declared layer (e.g. ${dir}) and the net arms itself`;
}

/** One-line coverage report — loud when the net catches nothing. */
export function renderCoverage(coverage: Coverage, blueprint: Blueprint): string {
  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0) {
    return `⚠ Enforcement is vacuous — layer globs match 0 of ${coverage.sourceFiles} source `
      + `file(s); a green gate proves nothing yet — ${vacuousNextStep(blueprint)}.`;
  }

  return `Coverage: ${coverageSummary(coverage)}`;
}
