import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { cli, configSource, makeRepo, react, rm, wiredEslintConfig } from './conformance';
import type { RepoSpec } from './conformance';

/**
 * The other half of a modular adoption: what `inspect` and `doctor` say about
 * the same tree the emitted lint config governs.
 *
 * `conformance.modules.test.ts` asks the linter; this asks the two runtimes,
 * through their own CLI dispatch on a real fixture repo. They are separate
 * proofs because they failed separately: `emitLint` compiled the module axis
 * correctly for a whole stage while `analyze` still read a declared module
 * folder as undeclared and `computeCoverage` counted every module file as
 * outside every net — a repo that lints correctly and reports itself as
 * ungoverned debt.
 */

const dirs: string[] = [];

const repo = (spec: RepoSpec): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

/** Two modules, the smallest tree that can show a cross-module fact at all. */
const twoModules: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'hooks', does: 'state' },
    ],
    modules: [
      { name: 'App', does: 'the game shell' },
      { name: 'common', does: 'shared helpers', layers: false },
    ],
    folder: { layout: 'flat', entry: 'index', private: [] },
  },
};

/** The same layers with the `modules` block dropped — the flat reading of one tree. */
const flatReading: Blueprint = {
  ...twoModules,
  architecture: { ...twoModules.architecture, modules: undefined },
};

const SOURCE: Record<string, string> = {
  'src/App/index.js': 'export const App = 1;\n',
  'src/App/components/Board.js': 'export const Board = 1;\n',
  'src/App/hooks/useGame.js': 'export const useGame = 1;\n',
  'src/common/index.js': 'export const common = 1;\n',
  'src/common/clamp.js': 'export const clamp = 1;\n',
  // Root wiring, in no module at all — the file that keeps `outsideNets: []`
  // below from being an answer this fixture could not have contradicted.
  'src/main.js': 'export const main = 1;\n',
};

const declared = (blueprint: Blueprint, files: Record<string, string> = SOURCE): string =>
  repo({
    packageJson: react(),
    files: { 'blueprint.config.mjs': configSource(blueprint), ...files },
  });

interface InspectReport {
  ok: boolean;
  findings: { rule: string; path: string; severity: string; message: string }[];
  coverage: { sourceFiles: number; layerFiles: number; outsideNets: string[] };
}

const inspectJson = async (dir: string): Promise<InspectReport> =>
  JSON.parse((await cli(dir, ['inspect', '--json'])).output) as InspectReport;

const rulesOf = (report: InspectReport, rule: string): string[] =>
  report.findings.filter((finding) => finding.rule === rule).map((finding) => finding.path);

/** The three coverage numbers a net's reach is read from — the gate counts are another claim. */
const reachOf = (report: InspectReport): InspectReport['coverage'] => {
  const { sourceFiles, layerFiles, outsideNets } = report.coverage;

  return { sourceFiles, layerFiles, outsideNets };
};

describe('AC15 · a declared module folder is not an undeclared folder', () => {
  it('reports zero on the correctly-declared fixture — and the tree is clean', async () => {
    const dir = declared(twoModules);
    const report = await inspectJson(dir);

    expect(rulesOf(report, 'undeclared-folder')).toEqual([]);
    // Zero of everything, not zero of one rule: a module folder read as
    // undeclared was the loud half, and `missing-layer` fired inside modules
    // that are on disk was the quiet one.
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);

    const text = await cli(dir, ['inspect']);

    expect(text.code).toBe(0);
    expect(text.output).toContain('✓ Architecture Success');
  });

  it('reads the identical tree as 2 undeclared folders once `modules` is dropped', async () => {
    // The before half of the same measurement, through the same command on the
    // same files — so "zero" above is the config being understood, not a rule
    // that stopped firing. Exactly the two module folders, by name.
    const dir = declared(flatReading);
    const report = await inspectJson(dir);

    expect(rulesOf(report, 'undeclared-folder')).toEqual(['src/App', 'src/common']);
    expect(report.ok).toBe(false);
  });

  it('says missing-module in missing-layer\'s runway wording, not undeclared-folder', async () => {
    // Declared and not built yet. The flat model already answers this for a
    // layer, and answering it differently one depth up would make a normal
    // mid-adoption state read as debt.
    const built = Object.entries(SOURCE).filter(([file]) => !file.startsWith('src/common/'));
    const dir = declared(twoModules, Object.fromEntries(built));

    const report = await inspectJson(dir);
    const note = report.findings.find((finding) => finding.rule === 'missing-module');

    expect(note).toMatchObject({ severity: 'info', path: 'src/common' });
    expect(note?.message).toContain('Declared module "common" has no folder yet');
    expect(note?.message).toContain('runway, not a todo');
    expect(rulesOf(report, 'undeclared-folder')).toEqual([]);

    // Info is not debt, so the gate stays green while the runway is empty.
    const text = await cli(dir, ['inspect']);

    expect(text.code).toBe(0);
    expect(text.output).toContain('[missing-module] src/common');
  });
});

describe('AC13b · a `layers: false` module is inside the net inspect measures', () => {
  it('counts its files, and still names the root wiring that is outside', async () => {
    const report = await inspectJson(declared(twoModules));

    // Five source files in the two modules, one at the root that is in neither.
    expect(reachOf(report)).toEqual({
      sourceFiles: 6,
      layerFiles: 5,
      outsideNets: ['src/main.js'],
    });
  });

  it('reports coverage rather than calling the whole repo vacuous', async () => {
    const text = await cli(declared(twoModules), ['inspect']);

    expect(text.output).toContain('Coverage: 5/6 source files inside layer nets');
    expect(text.output).not.toContain('Enforcement is vacuous');
  });
});

describe('AC13b · doctor probes the `layers: false` module\'s own net', () => {
  const wired = (extra = ''): string =>
    declared(twoModules, { ...SOURCE, 'eslint.config.mjs': wiredEslintConfig(twoModules, extra) });

  it('verifies the emitted rules survive when the config is untouched', async () => {
    const doctor = await cli(wired(), ['doctor']);

    // The skip label shares this prefix, so the "(" demands the verified verdict.
    expect(doctor.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(doctor.output).not.toContain('skipped');
  });

  it('turns red when a later entry guts that module\'s entry, and names it', async () => {
    // Flat config replaces a rule rather than merging it, so this entry drops
    // every module-axis ban on `common` while lint stays green. A module with
    // no layer subfolder to net had no probe at all before this stage, so the
    // loss was invisible — the check passed by not looking.
    const gutting = '  { "files": ["src/common/**/*.js"], '
      + '"rules": { "no-restricted-imports": ["error", { "paths": ["left-pad"] }] } },';

    const doctor = await cli(wired(gutting), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('✗ emitted rules survive the merged eslint config');
    expect(doctor.output).toContain('common: no-restricted-imports lost');
    expect(doctor.output).toContain('structural pattern group(s)');
    // Scoped to the net the entry actually replaced — the layered module's
    // three nets are untouched, and a check that reddened everything would
    // prove nothing about which one it probed.
    expect(doctor.output).not.toContain('App:');
  });
});

describe('AC13b · the emitted net reaches the module\'s files on disk', () => {
  it('lints them through impact instead of reporting a vacuous zero', async () => {
    // `impact` runs the project's own ESLint over the globs `emitLint` resolves.
    // A bare layer glob (`src/hooks/**`) matches nothing in this tree, and the
    // failure looks exactly like a clean repo — so the file count is asserted.
    const dir = declared(twoModules, {
      ...SOURCE,
      'src/common/deep/reach.js': 'import \'~app/App/hooks/useGame\';\nexport const reach = 1;\n',
    });

    const impact = await cli(dir, ['impact', '--json']);

    const report = JSON.parse(impact.output) as {
      linted: number;
      total: number;
      impacts: { rule: string; foreign: boolean; top: { path: string }[] }[];
    };

    // Every file of both modules reached the linter; `src/main.js` is outside
    // every net and is not handed to it.
    expect(report.linted).toBe(6);
    expect(report.total).toBe(1);

    const [hit] = report.impacts;

    expect(hit).toMatchObject({ rule: 'no-restricted-imports', foreign: false });
    expect(hit.top).toEqual([{ path: 'src/common/deep/reach.js', count: 1 }]);
  });
});

describe('AC8 · the flat structure is unchanged where a project does not opt in', () => {
  // A flat tree — the layers ARE the top-level folders. Two repos rather than
  // one rewritten config: `resolveBlueprint` loads the config by dynamic
  // import, and Node caches an ES module by URL, so a second read of a
  // rewritten file in the same directory answers with the first one.
  const FLAT: Record<string, string> = {
    'src/components/Board.js': 'export const Board = 1;\n',
    'src/hooks/useGame.js': 'export const useGame = 1;\n',
  };

  it('leaves a repo that never mentions modules reading exactly as before', async () => {
    const report = await inspectJson(declared(flatReading, FLAT));

    expect(report.findings).toEqual([]);
    expect(reachOf(report)).toEqual({ sourceFiles: 2, layerFiles: 2, outsideNets: [] });
  });

  it('reads the same tree as misplaced once modules ARE declared', async () => {
    // The other end of the same switch: `modules` declared moves the source
    // root's own vocabulary one level up, so a layer folder sitting there is
    // the thing to move — and the message says declaring it is not the fix,
    // because a module may not take a layer's name.
    const report = await inspectJson(declared(twoModules, FLAT));

    expect(rulesOf(report, 'undeclared-folder')).toEqual(['src/components', 'src/hooks']);

    const [first] = report.findings;

    expect(first.message).toContain('is a declared layer, not a module');
    expect(first.message).toContain('e.g. "App/components"');
  });
});
