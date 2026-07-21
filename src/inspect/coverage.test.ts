import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { LINT_GATED_RULE_IDS } from '../emit/lint/patterns';
import { computeCoverage, renderCoverage } from './coverage';
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
});

describe('renderCoverage', () => {
  it('renders the one-line summary', () => {
    const line = renderCoverage({ sourceFiles: 2, layerFiles: 1, activeRules: 2, gatedRules: 13 });

    expect(line).toContain('Coverage: 1/2 source files inside layer nets');
    expect(line).toContain('2/13 gated rules active');
  });

  it('screams when files exist but the net catches none of them', () => {
    const line = renderCoverage({ sourceFiles: 3, layerFiles: 0, activeRules: 2, gatedRules: 13 });

    expect(line).toContain('Enforcement is vacuous');
    expect(line).toContain('0 of 3 source file(s)');
  });

  it('stays calm on an empty repo — nothing exists to cover yet', () => {
    const line = renderCoverage({ sourceFiles: 0, layerFiles: 0, activeRules: 2, gatedRules: 13 });

    expect(line).toContain('Coverage: 0/0');
    expect(line).not.toContain('vacuous');
  });
});
