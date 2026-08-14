import { activeSetting } from '../config';
import type { Blueprint } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { LINT_GATED_RULE_IDS, resolveGovernedFiles, unavailableGate } from '../emit/lint/patterns';
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
   * The ones NOT matched, by path. The count alone is uncheckable: `272/275` reads
   * the same whether the three are root wiring or a layer file a mistyped glob
   * dropped out of the net.
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

  // The module root counts inside the net: it is where a module's own
  // composition code sits, and listing it as "outside" would report the most
  // important file in the module as ungoverned.
  const nets = resolveGovernedFiles(architecture, framework).map(globToRegExp);

  const outside = source.filter((file) => !nets.some((net) => net.test(file.path)));
  const layerFiles = source.length - outside.length;

  // A gate you cannot open is not a gate, and which those are lives in one place —
  // this filter and `blueprint rules`' mirror had drifted into two denominators
  // (field run #137). The stylistic gates are not among them: every stack can open
  // those, and whether the config injects the plugin is a wiring fact this cannot see.
  const gates = LINT_GATED_RULE_IDS
    .filter((id) => unavailableGate(id, framework, hasTypescript, architecture.testFiles) === null);

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
  // NAMED, not just counted: the number reads identically whether the files are root
  // wiring or a layer file a mistyped glob dropped. Capped, because mid-adoption the
  // list is the whole repo and past the cap the count is the honest answer.
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
 * The concrete step that arms a vacuous net, named with declarations the
 * config actually carries. "Wired but proves nothing yet" is a tension every
 * vacuous callout carries — stating what closes the gap keeps it from reading
 * as a contradiction of "adoption complete".
 *
 * Under `modules` the address is two segments, not one. A layer is a folder
 * inside a module there, so `<sourceRoot>/<layer>/` is a top-level folder
 * holding source — which the same report calls an `undeclared-module` error,
 * and which `missing-layer` says outright not to create. The example carries
 * why it has two segments because `doctor` prints no findings: there the
 * sentence is the only thing on screen, under a ✓.
 *
 * The module named is the first that is not `layers: false`, because the
 * example exists to demonstrate the `<root>/<module>/<layer>/` shape and an
 * opted-out module cannot demonstrate it — the preset's own first module is
 * `app`, and declaring `app` as a routing module is the documented use of the
 * opt-out. When every module is opted out the shape genuinely has no layer
 * segment: `resolveModuleFiles` nets such a module entire, so code anywhere
 * inside it arms the gate.
 */
export function vacuousNextStep(blueprint: Blueprint): string {
  const { layers, modules, sourceRoot } = blueprint.architecture;
  const root = sourceRoot ?? 'src';
  const prefix = root === '.' ? '' : `${root}/`;
  const arms = 'and the net arms itself';

  if (modules === undefined) {
    return `next: move code into a declared layer (e.g. ${prefix}${layers[0].name}/) ${arms}`;
  }

  const layered = modules.find((module) => module.layers !== false);

  if (layered === undefined) {
    return `next: move code into a declared module (e.g. ${prefix}${modules[0].name}/ — every `
      + `declared module sets \`layers: false\`, so there is no inner layer to name) ${arms}`;
  }

  return 'next: move code into a declared layer inside a declared module (e.g. '
    + `${prefix}${layered.name}/${layers[0].name}/ — under \`modules\` a layer is a folder inside `
    + `a module, never one at the source root) ${arms}`;
}

/** One-line coverage report — loud when the net catches nothing. */
export function renderCoverage(coverage: Coverage, blueprint: Blueprint): string {
  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0) {
    return `⚠ Enforcement is vacuous — layer globs match 0 of ${coverage.sourceFiles} source `
      + `file(s); a green gate proves nothing yet — ${vacuousNextStep(blueprint)}.`;
  }

  return `Coverage: ${coverageSummary(coverage)}`;
}
