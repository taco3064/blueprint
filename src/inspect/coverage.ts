import { activeSetting } from '../config';
import type { Blueprint } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import {
  emptyTestGlobs,
  LINT_GATED_RULE_IDS,
  resolveLayerFiles,
  toArray,
  unavailableGate,
  unreachedTestGlobs,
} from '../emit/lint/patterns';
import type { TestGlobReach } from '../emit/lint/patterns';
import { dropTestFiles, globToRegExp, isTestFile } from './filter';
import { outsideScanReach } from './scan';
import type { ScanResult } from './types';
import { syntheticProbePaths } from './wiring';

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
  /**
   * Why the declared test exemption reaches nothing here — which entries reach no file,
   * or that the net was declared empty — absent when it reaches something, which is the
   * ordinary case. It rides on the coverage report because the run that prints findings
   * against test files is the one that has to say why those files stopped being exempt,
   * and the empty net is the shape that also moves `gatedRules` two fields up.
   */
  testExemption?: string;
}

/**
 * What each DECLARED test-exemption glob reaches here — the measurement no blueprint
 * can make, taken once so both runtimes read the same numbers.
 *
 * `toArray`, not `resolveTestFiles`: this measures what the config says, so a config
 * that says nothing has nothing measured and nothing to be told about. It compiles
 * through the same `globToRegExp` / `isTestFile` pair `dropTestFiles` exempts by, so
 * "matched 0 here" and "exempted nothing there" cannot come apart.
 *
 * `sourceRoot` is required rather than defaulted, and it is what carries `outsideScanReach`
 * to the sibling field. `emit/lint` sits below `inspect`, so `unreachedTestGlobs` cannot
 * ask that question itself; the answer rides on the measurement, and a default here would
 * let a call site state a classification against a root it never passed. `unreached` is
 * omitted rather than set to null, so a reader compares a measurement, not an absence.
 */
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

/**
 * The DECLARED `layerFilesIgnore` entries that hold nothing out here — `testFileReach`'s
 * sibling for the other declared net this package compiles against a real tree.
 *
 * A sibling rather than one shared helper. `testFileReach` answers with a count per
 * entry because `unreachedTestGlobs` names the entries that reached nothing while the
 * net around them may have reached plenty — and nothing counts these: an ignore entry is
 * only ever asked whether it holds anything out, so a shared shape would carry a number
 * no caller reads. What the two do share is the position on what a dead entry means, and
 * that stays one sentence rather than two.
 *
 * Two candidate sets, because `pickProbes` compiles the field against two. The scan
 * is taken whole rather than as the `dropTestFiles` list `pickProbes` filters: the
 * sentence this feeds says no file here matches, which has to stay literally true of
 * the tree, and an entry naming only test files would otherwise be called dead while
 * it is doing exactly what it was written to do. `syntheticProbePaths` is the other
 * half, and without it this measurement contradicts the run it prints under — an
 * entry can match no file in the tree and still swallow a layer's synthetic probe,
 * which is a thing held out, not an inert entry.
 *
 * The second set is weighed per entry and holds only the stand-ins `pickProbes` would
 * really derive here, which is the "in place of a file it does not have" half of it: a
 * layer holding a file is probed with that file, so an entry colliding with a stand-in
 * for that layer collides with a path nothing derives and is dead however well the
 * collision reads. What comes back is the set whose removal leaves `pickProbes` alone.
 */
export function unreachedIgnoreGlobs(scanResult: ScanResult, blueprint: Blueprint): string[] {
  const declared = toArray(blueprint.architecture.layerFilesIgnore);

  return declared.filter((glob, index) => {
    const pattern = globToRegExp(glob);

    // Which layers need a stand-in depends on the ignores, so the entry under
    // measurement is lifted out before asking. Left in, an entry that swallows a
    // layer's only file is the reason that layer needs a stand-in, and matching it
    // proves only that the entry matched itself. Undecidable against the file test
    // below, which already excludes every entry that reaches a file and therefore
    // every entry that can move a hit; the lift is what keeps the two independent.
    const standIns = syntheticProbePaths(blueprint, scanResult, [
      ...declared.slice(0, index),
      ...declared.slice(index + 1),
    ]);

    return !scanResult.files.some((file) => pattern.test(file.path))
      && !standIns.some((candidate) => pattern.test(candidate));
  });
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
  const testReach = testFileReach(scanResult, architecture.testFiles, architecture.sourceRoot);

  const nets = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, framework, architecture),
      ),
    ),
  ].map(globToRegExp);

  const outside = source.filter((file) => !nets.some((net) => net.test(file.path)));
  const layerFiles = source.length - outside.length;

  // A gate you cannot open is not a gate, and which those are lives in one place —
  // this filter and `blueprint rules`' mirror had drifted into two denominators
  // (field run #137). The stylistic gates are not among them: every stack can open
  // those, and whether the config injects the plugin is a wiring fact this cannot see.
  const gates = LINT_GATED_RULE_IDS
    .filter((id) => unavailableGate(
      id,
      { framework, hasTypescript, testFiles: architecture.testFiles },
    ) === null);

  const activeRules = gates.filter((id) => activeSetting(rules?.[id]) !== null).length;

  // The two sentences about one field, taken where the count that moves with them is
  // taken: `unavailableGate` above has already dropped `testFilename` out of `gates` on
  // an empty net, and the entry-naming sentence has no entry to name there. Here rather
  // than at each reader, so the count and the reason it moved come off one measurement
  // and cannot arrive at one surface without the other.
  const testExemption = unreachedTestGlobs(testReach) ?? emptyTestGlobs(architecture.testFiles);

  return {
    sourceFiles: source.length,
    layerFiles,
    outsideNets: outside.map((file) => file.path),
    activeRules,
    gatedRules: gates.length,
    ...(testExemption === null ? {} : { testExemption }),
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
  // On both branches, not just the healthy one: a broken exemption puts test files
  // back inside the analysis, which is exactly where a vacuous net gets reported too.
  // Info tier — the findings above already carry the verdict, and this line only says
  // where they came from, so a repo that is green today stays green.
  const exemption = coverage.testExemption === undefined ? '' : `\n· ${coverage.testExemption}`;

  if (coverage.sourceFiles > 0 && coverage.layerFiles === 0) {
    return `⚠ Enforcement is vacuous — layer globs match 0 of ${coverage.sourceFiles} source `
      + `file(s); a green gate proves nothing yet — ${vacuousNextStep(blueprint)}.${exemption}`;
  }

  return `Coverage: ${coverageSummary(coverage)}${exemption}`;
}
