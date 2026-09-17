import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { reactPreset } from '../presets';
import { computeCoverage, renderCoverage, vacuousNextStep } from './coverage';
import type { ScanResult } from './types';

const runway: Blueprint = reactPreset({ modules: [] });

const scan: ScanResult = {
  topDirs: [],
  files: [{ path: 'src/main.tsx', segments: ['main.tsx'], imports: [] }],
};

describe('coverage · module-first runway', () => {
  it('names growth instead of a declared module when no domain module exists', () => {
    expect(vacuousNextStep(runway)).toBe('next: no domain module is declared yet (module-first '
      + 'runway) — when owner-requested product work arrives, materialize its owning module '
      + 'through the module growth protocol in the handbook and the net arms itself');
  });

  it('keeps naming a declared position once a domain module exists', () => {
    expect(vacuousNextStep(reactPreset({ modules: [{ name: 'checkout', does: 'Checkout.' }] })))
      .toContain('move code into a declared module and layer (e.g. src/checkout/components/)');
  });

  it('reports source-root wiring outside empty nets without failing', () => {
    const coverage = computeCoverage(scan, runway, true);

    expect(coverage)
      .toMatchObject({ sourceFiles: 1, layerFiles: 0, outsideNets: ['src/main.tsx'] });

    expect(renderCoverage(coverage, runway)).toContain('module growth protocol in the handbook');
  });
});
