import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { LINT_GATED_RULE_IDS } from '../emit/lint';
import { computeCoverage, renderCoverage, vacuousNextStep } from './coverage';
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
      { sourceFiles: 2, layerFiles: 1, outsideNets: ['src/main.tsx'], activeRules: 0, gatedRules: 13 },
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
      { sourceFiles: 3, layerFiles: 0, outsideNets: ['a.ts', 'b.ts', 'c.ts'], activeRules: 2, gatedRules: 13 },
      blueprint,
    );

    expect(line).toContain('Enforcement is vacuous');
    expect(line).toContain('0 of 3 source file(s)');
    // The tension-closer: the callout names the concrete step that arms the net.
    expect(line).toContain('next: move code into a declared layer (e.g. src/components/)');
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
