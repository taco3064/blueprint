import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { LINT_GATED_RULE_IDS } from '../emit/lint/patterns';
import {
  computeCoverage,
  renderCoverage,
  testFileReach,
  unreachedIgnoreGlobs,
  vacuousNextStep,
} from './coverage';
import type { ScanResult } from './types';

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'talk to the backend' },
    ],
    module: { layout: 'folder', entry: 'index', private: [] },
  },
  // `cycles` is off and `deadCode` is docs-only — neither counts as active.
  rules: { maxLines: 'error', unusedVars: { tier: 'warn' }, cycles: 'off', deadCode: 'error' },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

describe('computeCoverage', () => {
  it('counts net files against non-test sources, and active gated rules', () => {
    const coverage = computeCoverage(
      scanOf('src/components/Button.vue', 'src/main.ts', 'src/components/Button.test.ts'),
      blueprint,
      true,
    );

    expect(coverage).toEqual({
      sourceFiles: 2, // the test file is dropped, root wiring still counts
      layerFiles: 1, // only Button.vue sits inside a declared layer's glob
      // Named, and the test file is NOT among them — it was dropped before the nets ran,
      // so calling it uncovered would report a file nobody chose to leave out.
      outsideNets: ['src/main.ts'],
      activeRules: 2, // maxLines + unusedVars
      gatedRules: LINT_GATED_RULE_IDS.length,
    });
  });

  it('handles a blueprint with no rules block', () => {
    const coverage = computeCoverage(scanOf(), { ...blueprint, rules: undefined }, true);

    expect(coverage).toMatchObject({ sourceFiles: 0, layerFiles: 0, activeRules: 0 });
  });

  it('drops the Vue-only deepWatch gate from a React denominator', () => {
    const coverage = computeCoverage(scanOf(), { ...blueprint, framework: 'react' }, true);

    // A gate that never emits on this framework must not be counted as closable.
    expect(coverage.gatedRules).toBe(LINT_GATED_RULE_IDS.length - 1);
  });

  it('drops the TS-only explicitAny gate from a JavaScript denominator', () => {
    // `any` cannot appear in JS source — the gate has nothing to catch and no
    // rule to emit, so counting it would inflate the denominator forever.
    const js = computeCoverage(scanOf(), blueprint, false);

    expect(js.gatedRules).toBe(LINT_GATED_RULE_IDS.length - 1);

    // Both exclusions stack: a React + JS repo can open neither.
    const both = computeCoverage(scanOf(), { ...blueprint, framework: 'react' }, false);

    expect(both.gatedRules).toBe(LINT_GATED_RULE_IDS.length - 2);
  });

  it('counts a declared explicitAny as active only where it can emit', () => {
    const declared = { ...blueprint, rules: { ...blueprint.rules, explicitAny: 'error' as const } };

    expect(computeCoverage(scanOf(), declared, true).activeRules).toBe(3);
    expect(computeCoverage(scanOf(), declared, false).activeRules).toBe(2);
  });
});

describe('vacuousNextStep', () => {
  it('names the first declared layer under the source root, respecting a "." root', () => {
    expect(vacuousNextStep(blueprint))
      .toBe('next: move code into a declared layer (e.g. src/components/) and the net arms itself');

    const rooted = { ...blueprint, architecture: { ...blueprint.architecture, sourceRoot: '.' } };

    expect(vacuousNextStep(rooted)).toContain('(e.g. components/)');
  });
});

describe('renderCoverage', () => {
  it('renders the one-line summary without implying structural rules are off', () => {
    const line = renderCoverage(
      {
        sourceFiles: 2,
        layerFiles: 1,
        outsideNets: ['src/main.tsx'],
        activeRules: 0,
        gatedRules: 13,
      },
      blueprint,
    );

    expect(line).toContain('Coverage: 1/2 source files inside layer nets');
    // NAMED, not just counted: 1/2 reads the same whether the odd file is root wiring
    // or a layer file a mistyped glob dropped. A field agent had to confirm the glob by
    // other means because the number could not tell it.
    expect(line).toContain('outside: src/main.tsx');
    expect(line).toContain('root wiring belongs here; a layer file does not');
    // "0 active" must not read as "nothing enforced" — structural rules always emit.
    expect(line).toContain('0/13 optional gates active');
    expect(line).toContain('structural boundary rules are always on');
  });

  it('stops naming past the cap, and says why the count is the answer there', () => {
    // Mid-adoption on a brownfield repo the list IS the repo, and six names in a
    // one-line summary stop being readable. Past the cap the count is the honest
    // answer — but it has to say that, or it reads like the naming broke.
    const line = renderCoverage(
      {
        sourceFiles: 8,
        layerFiles: 2,
        outsideNets: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
        activeRules: 2,
        gatedRules: 13,
      },
      blueprint,
    );

    expect(line).toContain('6 outside — too many to name');
    expect(line).toContain('expected while layers are still empty');
    // The names themselves must be gone, or the cap did nothing.
    expect(line).not.toContain('a.ts');

    // The cap itself, at the boundary: exactly five still get named. `>` and `>=`
    // differ on this one input and nowhere else, so without it the cap could sit one
    // file off and every other case would still pass.
    const atCap = renderCoverage(
      {
        sourceFiles: 7,
        layerFiles: 2,
        outsideNets: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
        activeRules: 2,
        gatedRules: 13,
      },
      blueprint,
    );

    expect(atCap).toContain('outside: a.ts, b.ts, c.ts, d.ts, e.ts');
    expect(atCap).not.toContain('too many to name');
  });

  it('screams when files exist but the net catches none of them', () => {
    const line = renderCoverage(
      {
        sourceFiles: 3,
        layerFiles: 0,
        outsideNets: ['a.ts', 'b.ts', 'c.ts'],
        activeRules: 2,
        gatedRules: 13,
      },
      blueprint,
    );

    expect(line).toContain('Enforcement is vacuous');
    expect(line).toContain('0 of 3 source file(s)');
    // The tension-closer: the callout names the concrete step that arms the net.
    expect(line).toContain('next: move code into a declared layer (e.g. src/components/)');
  });

  it('carries a broken test exemption onto the vacuous branch too', () => {
    // The vacuous branch returns early, and it is where a broken exemption is most
    // likely to land: unexempted test files are files outside every layer net. A cause
    // that prints only on the healthy branch is missing exactly where it is needed.
    const why = '`architecture.testFiles` (`**/*.test.{ts`) matches no file here';

    const vacuous = renderCoverage(
      {
        sourceFiles: 3,
        layerFiles: 0,
        outsideNets: ['a.test.ts', 'b.test.ts', 'c.test.ts'],
        activeRules: 2,
        gatedRules: 13,
        testExemption: why,
      },
      blueprint,
    );

    expect(vacuous).toContain('Enforcement is vacuous');
    expect(vacuous).toContain(`\n· ${why}`);

    // Info tier, on its own line — the findings above already carry the verdict, and
    // nothing here turns a passing run red. One shape, rendered with the key and then
    // without it, because that difference is the whole of what the guard reads.
    const shape
      = { sourceFiles: 2, layerFiles: 2, outsideNets: [], activeRules: 2, gatedRules: 13 };

    expect(renderCoverage({ ...shape, testExemption: why }, blueprint)).toContain(`\n· ${why}`);

    // And absent when the key is: `undefined` is what the emit side leaves on a repo
    // whose every declared entry reaches something, and this guard is its only reader —
    // read `null` there instead and every green run carries a bare `· undefined`.
    expect(renderCoverage(shape, blueprint)).not.toContain('\n· ');
    expect(renderCoverage({ ...shape, layerFiles: 0 }, blueprint)).not.toContain('\n· ');
  });

  it('stays calm on an empty repo — nothing exists to cover yet', () => {
    const line = renderCoverage(
      { sourceFiles: 0, layerFiles: 0, outsideNets: [], activeRules: 2, gatedRules: 13 },
      blueprint,
    );

    expect(line).toContain('Coverage: 0/0');
    expect(line).not.toContain('vacuous');
    // Nothing outside the net either, so the clause must be absent — naming an empty
    // set reads as a gap where there is none.
    expect(line).not.toContain('outside');
  });
});

describe('testFileReach — the measurement, per declared entry', () => {
  const tree = scanOf('src/pages/a.ts', 'src/pages/a.test.ts', 'src/services/b.spec.ts');

  it('counts each declared glob separately, live entries included', () => {
    // The union of these two reaches two files and looks healthy; the second entry
    // reaches none. One total cannot hold both facts, so there is no total.
    expect(testFileReach(tree, ['**/*.test.ts', '**/*.spec.{ts'])).toEqual([
      { glob: '**/*.test.ts', matched: 1 },
      { glob: '**/*.spec.{ts', matched: 0 },
    ]);
  });

  it('measures what the config declares, never the built-in pair', () => {
    // An absent field and `[]` are the same thing here: nothing declared is nothing
    // to measure, so no entry can be reported dead. Substituting the default pair
    // would make every testless repo look like a broken config.
    expect(testFileReach(tree, undefined)).toEqual([]);
    expect(testFileReach(tree, [])).toEqual([]);
    // A bare string is one entry, not a spread of characters.
    expect(testFileReach(tree, '**/*.spec.ts')).toEqual([{ glob: '**/*.spec.ts', matched: 1 }]);
  });
});

describe('unreachedIgnoreGlobs — the sibling measurement, per declared entry', () => {
  const tree = scanOf('src/pages/a.ts', 'src/pages/a.gen.ts', 'src/pages/a.test.ts');

  const ignoring = (layerFilesIgnore: string | string[]): Blueprint => ({
    ...blueprint,
    architecture: { ...blueprint.architecture, layerFilesIgnore },
  });

  it('names only the entries that reach nothing, never the whole declaration', () => {
    // The union of these two holds a file out and looks healthy; the second entry
    // holds out nothing. A per-net answer cannot say which one to fix.
    expect(unreachedIgnoreGlobs(tree, ignoring(['**/*.gen.ts', '**/*.{gen'])))
      .toEqual(['**/*.{gen']);

    expect(unreachedIgnoreGlobs(tree, ignoring(['**/*.gen.ts']))).toEqual([]);
  });

  it('measures what the config declares, so an undeclared field reports nothing', () => {
    // Absent and `[]` are the same state: nothing declared is nothing that can be
    // dead, and a repo that never wrote this field must not be told about it.
    expect(unreachedIgnoreGlobs(tree, blueprint)).toEqual([]);
    expect(unreachedIgnoreGlobs(tree, ignoring([]))).toEqual([]);
    // A bare string is one entry, not a spread of characters.
    expect(unreachedIgnoreGlobs(tree, ignoring('**/*.{gen'))).toEqual(['**/*.{gen']);
  });

  it('measures the whole scan, not the non-test files `pickProbes` filters', () => {
    // An entry naming only test files holds nothing out of probe candidacy, because
    // `dropTestFiles` removed those files first — but "no file here matches" would be
    // a false sentence about the tree, and it is the sentence this feeds.
    expect(unreachedIgnoreGlobs(tree, ignoring('**/*.test.ts'))).toEqual([]);
  });

  it('measures the stand-in probe paths too, so a swallowed layer is not called dead', () => {
    // `pickProbes` compiles this field against two sets, and an entry reaching only the
    // second is the opposite of inert: it removed a layer's probe. Measured off the tree
    // alone, both of these read as dead, and the sentence it feeds would deny the run
    // printing it — under `all 7 checks passed`, beside the skip it caused.
    expect(unreachedIgnoreGlobs(tree, ignoring('src/services/**'))).toEqual([]);
    // The reachable extreme: no file anywhere, so every layer's probe goes.
    expect(unreachedIgnoreGlobs(scanOf(), ignoring('src/**'))).toEqual([]);
    // And still dead when it reaches neither set — the entry this note exists for.
    expect(unreachedIgnoreGlobs(scanOf(), ignoring('**/*.{gen'))).toEqual(['**/*.{gen']);
  });

  it('weighs an entry only against the stand-ins a populated tree still derives', () => {
    // Both layers hold a file, so `pickProbes` probes with those files and derives no
    // stand-in at all here. `**/*.js` collides with `src/components/__blueprint_probe__.js`
    // and the control one character away collides with nothing — neither changes a probe,
    // so both are dead, and this tree is where a whole-declaration list silences the first.
    const populated = scanOf('src/components/Button.vue', 'src/services/api.ts');

    expect(unreachedIgnoreGlobs(populated, ignoring('**/*.js'))).toEqual(['**/*.js']);
    expect(unreachedIgnoreGlobs(populated, ignoring('**/*.nope'))).toEqual(['**/*.nope']);

    // The layer with no file still derives one, so the same entry stays silent there.
    expect(unreachedIgnoreGlobs(scanOf('src/components/Button.vue'), ignoring('**/*.js')))
      .toEqual([]);
  });

  it('lifts one entry, not the declaration — a sibling can be why a stand-in exists', () => {
    // Two entries, and the second is alive only because of the first. `src/services/**`
    // takes that layer's only file out of probe candidacy, so `pickProbes` falls back to
    // `src/services/__blueprint_probe__.js` — and `**/*.js` takes that stand-in too, which
    // is a probe removed, not an inert entry. Lift the whole declaration instead of just
    // the entry under measurement and both layers keep their files, no stand-in is derived
    // anywhere, and the live entry reads as dead. Every other fixture here declares one
    // entry, where lifting one and lifting all are the same operation.
    const populated = scanOf('src/components/Button.vue', 'src/services/api.ts');

    expect(unreachedIgnoreGlobs(populated, ignoring(['src/services/**', '**/*.js']))).toEqual([]);

    // The same two entries the other way round, because one order cannot separate the
    // two halves of the lift. With the swallower first, the entry that needs it is at a
    // LATER index and only the preceding half carries it; reversed, only the following
    // half does. An order that loses the mirror loses this: the live entry reported as
    // reaching nothing, which is the class stage 5 spent a stage removing.
    expect(unreachedIgnoreGlobs(populated, ignoring(['**/*.js', 'src/services/**']))).toEqual([]);
  });
});

describe('computeCoverage · reading a gate tier', () => {
  it('reads an object-form off tier as off, like the string form', () => {
    // A gate can be written `'off'` or `{ tier: 'off' }`. Taking the whole
    // setting as the tier makes the object form compare unequal to 'off' and the
    // gate counts as active — doctor then reports coverage from a rule the user
    // switched off.
    const objectOff: Blueprint = {
      ...blueprint,
      rules: { maxLines: { tier: 'off', value: 400 } },
    };

    const stringOff: Blueprint = { ...blueprint, rules: { maxLines: 'off' } };

    const empty = { topDirs: [], files: [] } as ScanResult;

    expect(computeCoverage(empty, objectOff, true).activeRules)
      .toBe(computeCoverage(empty, stringOff, true).activeRules);

    expect(computeCoverage(empty, objectOff, true).activeRules).toBe(0);
  });
});
