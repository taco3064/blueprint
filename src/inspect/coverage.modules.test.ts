import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { computeCoverage } from './coverage';
import type { ScanResult } from './types';

/**
 * AC13b: a module's files are counted in `inspect` coverage instead of being
 * silently excluded for having no layer subfolders to net. Before this stage,
 * `computeCoverage` built its nets from `architecture.layers.flatMap(layer =>
 * resolveLayerFiles(layer.name, ...))` alone — a bare layer glob (`src/hooks/**`)
 * that a modular file's real path (`src/Combat/hooks/x.ts`) never matches, so
 * every module file showed as `outsideNets`, uncounted, even though `emitLint`
 * was already governing it.
 */
const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state' },
      { name: 'components', does: 'ui' },
    ],
    modules: [
      { name: 'Combat', does: 'the fight loop' },
      { name: 'Lobby', does: 'matchmaking', layers: false },
    ],
  },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

describe('computeCoverage · a modular blueprint', () => {
  it('counts a module\'s own root file and its inner-layer files inside the net', () => {
    const coverage = computeCoverage(
      scanOf(
        'src/Combat/Combat.tsx', // module root
        'src/Combat/hooks/useCombat.ts', // inner layer
        'src/Combat/components/Fighter.tsx', // inner layer
      ),
      blueprint,
      true,
    );

    expect(coverage.sourceFiles).toBe(3);
    // Not the pre-stage-3 defect: none of these matched `src/hooks/**` or
    // `src/components/**` (the bare, module-blind globs), so all three would
    // have read as outsideNets — governed but invisible.
    expect(coverage.layerFiles).toBe(3);
    expect(coverage.outsideNets).toEqual([]);
  });

  it('counts every file of a layers: false module — one net for the whole thing', () => {
    const coverage = computeCoverage(
      scanOf('src/Lobby/Matchmaker.tsx', 'src/Lobby/sub/Deep.tsx'),
      blueprint,
      true,
    );

    expect(coverage.sourceFiles).toBe(2);
    expect(coverage.layerFiles).toBe(2);
    expect(coverage.outsideNets).toEqual([]);
  });

  it('still reports root wiring outside every module net as outside', () => {
    // main.ts sits at the source root, in no module at all — coverage should
    // keep naming it uncovered, the same as it always has for root wiring
    // beside a flat layer.
    const coverage = computeCoverage(
      scanOf('src/Combat/Combat.tsx', 'src/main.ts'),
      blueprint,
      true,
    );

    expect(coverage.sourceFiles).toBe(2);
    expect(coverage.layerFiles).toBe(1);
    expect(coverage.outsideNets).toEqual(['src/main.ts']);
  });
});
