import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { LINT_GATED_RULE_IDS } from '../emit/lint/patterns';
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
    flow: 'one-way',
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
    );

    expect(coverage).toEqual({
      sourceFiles: 2, // the test file is dropped, root wiring still counts
      layerFiles: 1, // only Button.vue sits inside a declared layer's glob
      activeRules: 2, // maxLines + unusedVars
      gatedRules: LINT_GATED_RULE_IDS.length,
    });
  });

  it('handles a blueprint with no rules block', () => {
    const coverage = computeCoverage(scanOf(), { ...blueprint, rules: undefined });

    expect(coverage).toMatchObject({ sourceFiles: 0, layerFiles: 0, activeRules: 0 });
  });

  it('drops the Vue-only deepWatch gate from a React denominator', () => {
    const coverage = computeCoverage(scanOf(), { ...blueprint, framework: 'react' });

    // A gate that never emits on this framework must not be counted as closable.
    expect(coverage.gatedRules).toBe(LINT_GATED_RULE_IDS.length - 1);
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
      { sourceFiles: 2, layerFiles: 1, activeRules: 0, gatedRules: 13 },
      blueprint,
    );

    expect(line).toContain('Coverage: 1/2 source files inside layer nets');
    // "0 active" must not read as "nothing enforced" — structural rules always emit.
    expect(line).toContain('0/13 optional gates active');
    expect(line).toContain('structural boundary rules are always on');
  });

  it('screams when files exist but the net catches none of them', () => {
    const line = renderCoverage(
      { sourceFiles: 3, layerFiles: 0, activeRules: 2, gatedRules: 13 },
      blueprint,
    );

    expect(line).toContain('Enforcement is vacuous');
    expect(line).toContain('0 of 3 source file(s)');
    // The tension-closer: the callout names the concrete step that arms the net.
    expect(line).toContain('next: move code into a declared layer (e.g. src/components/)');
  });

  it('stays calm on an empty repo — nothing exists to cover yet', () => {
    const line = renderCoverage(
      { sourceFiles: 0, layerFiles: 0, activeRules: 2, gatedRules: 13 },
      blueprint,
    );

    expect(line).toContain('Coverage: 0/0');
    expect(line).not.toContain('vacuous');
  });
});
