import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { computeCoverage, renderCoverage } from './coverage';
import type { ScanResult } from './types';

const blueprint: Blueprint = {
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [{ name: 'pages', does: 'routes' }],
    layerFilesIgnore: 'src/**/*.gen.ts',
  },
};

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((path) => ({ path, segments: path.split('/').slice(1), imports: [] })),
});

describe('computeCoverage · layerFilesIgnore', () => {
  it('separates ignored in-net files from reached and outside files', () => {
    expect(computeCoverage(
      scanOf('src/pages/Home.vue', 'src/pages/api.gen.ts', 'src/main.ts'),
      blueprint,
      true,
    )).toMatchObject({
      sourceFiles: 3,
      layerFiles: 1,
      ignoredFiles: ['src/pages/api.gen.ts'],
      outsideNets: ['src/main.ts'],
    });
  });

  it('does not add an optional result field when no ignore is declared', () => {
    const plain = {
      ...blueprint,
      architecture: { ...blueprint.architecture, layerFilesIgnore: undefined },
    };

    expect(computeCoverage(scanOf('src/pages/Home.vue'), plain, true))
      .not.toHaveProperty('ignoredFiles');
  });
});

describe('renderCoverage · layerFilesIgnore', () => {
  it('names a deliberately ignored layer file without calling the net vacuous', () => {
    const output = renderCoverage({
      sourceFiles: 1,
      layerFiles: 0,
      ignoredFiles: ['src/pages/api.gen.ts'],
      outsideNets: [],
      activeRules: 0,
      gatedRules: 1,
    }, blueprint);

    expect(output).toContain('0/1 source files reached by layer lint rules');
    expect(output).toContain('lint ignored: src/pages/api.gen.ts');
    expect(output).not.toContain('vacuous');
    expect(output).not.toContain('move code');
  });

  it('keeps the vacuous warning when a wrong layer glob reaches nothing', () => {
    const output = renderCoverage({
      sourceFiles: 1,
      layerFiles: 0,
      ignoredFiles: [],
      outsideNets: ['src/pages/Home.vue'],
      activeRules: 0,
      gatedRules: 1,
    }, blueprint);

    expect(output).toContain('Enforcement is vacuous');
    expect(output).toContain('move code');
  });

  it('stops naming ignored files past the readable cap', () => {
    const ignoredFiles = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];

    const output = renderCoverage({
      sourceFiles: 6,
      layerFiles: 0,
      ignoredFiles,
      outsideNets: [],
      activeRules: 0,
      gatedRules: 1,
    }, blueprint);

    expect(output).toContain('6 lint ignored — too many to name');

    for (const path of ignoredFiles) {
      expect(output).not.toContain(path);
    }
  });
});
