import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import type { ScanResult } from './types';
import { sourceRootProbeSites, sourceRootWiringEvidence } from './wiring-root';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [{ name: 'billing', does: 'billing' }],
    layers: [{ name: 'services', does: 'I/O' }],
  },
};

function scan(...paths: string[]): ScanResult {
  return { topDirs: [], files: paths.map((path) => ({
    path, segments: path.split('/'), imports: [],
  })) };
}

function expected(hit: string, glob = 'src/*.{js,jsx,ts,tsx}') {
  return [{ layer: null, globs: [glob], hit }];
}

describe('source-root Doctor probe selection', () => {
  it('does not apply the carrier to layer-first topology', () => {
    const configured = { ...blueprint, architecture: {
      ...blueprint.architecture, modules: undefined,
    } };

    expect(sourceRootProbeSites(configured, scan('src/main.ts'), [])).toEqual([]);
  });

  it('does not invent a probe without a governed direct source file', () => {
    expect(sourceRootProbeSites(blueprint, scan(), [])).toEqual([]);

    expect(sourceRootProbeSites(blueprint, scan(
      'outside.ts', 'src/style.css', 'src/billing/index.ts', 'src/billing/services/api.ts',
    ), [])).toEqual([]);
  });

  it('selects the first eligible direct source after nonmatching and ignored files', () => {
    expect(sourceRootProbeSites(blueprint, scan(
      'outside.ts', 'src/billing/index.ts', 'src/held.ts', 'src/main.ts', 'src/other.ts',
    ), ['src/absent.ts', 'src/held.ts'])).toEqual(expected('src/main.ts'));

    expect(sourceRootProbeSites(blueprint, scan('src/held.ts'), ['src/held.ts']))
      .toEqual([]);

    expect(sourceRootProbeSites(blueprint, scan('src/main.ts'), ['src/absent.ts']))
      .toEqual(expected('src/main.ts'));
  });

  it('honors default and explicit test exemptions, including disabled exemptions', () => {
    expect(sourceRootProbeSites(blueprint, scan('src/main.test.ts'), [])).toEqual([]);

    expect(sourceRootProbeSites(blueprint, scan('src/main.test.ts', 'src/main.ts'), []))
      .toEqual(expected('src/main.ts'));

    const configured = { ...blueprint, architecture: {
      ...blueprint.architecture, testFiles: ['src/custom.ts'],
    } };

    expect(sourceRootProbeSites(configured, scan('src/custom.ts', 'src/main.ts'), []))
      .toEqual(expected('src/main.ts'));

    expect(sourceRootProbeSites({ ...blueprint, architecture: {
      ...blueprint.architecture, testFiles: [],
    } }, scan('src/main.test.ts'), [])).toEqual(expected('src/main.test.ts'));
  });

  it('uses the framework and configured source root for exact probe membership', () => {
    expect(sourceRootProbeSites(blueprint, scan('src/main.vue'), [])).toEqual([]);

    expect(sourceRootProbeSites({ ...blueprint, framework: 'vue' }, scan('src/main.vue'), []))
      .toEqual(expected('src/main.vue', 'src/*.{js,jsx,ts,tsx,vue}'));

    expect(sourceRootProbeSites({ ...blueprint, architecture: {
      ...blueprint.architecture, sourceRoot: 'client/source',
    } }, scan('src/main.ts', 'client/source/main.ts'), []))
      .toEqual(expected('client/source/main.ts', 'client/source/*.{js,jsx,ts,tsx}'));

    expect(sourceRootProbeSites({ ...blueprint, architecture: {
      ...blueprint.architecture, sourceRoot: '.',
    } }, scan('src/main.ts', 'main.ts'), []))
      .toEqual(expected('main.ts', '*.{js,jsx,ts,tsx}'));
  });
});

describe('source-root Doctor carrier policy comparison', () => {
  it('accepts exactly the declared architecture', () => {
    expect(sourceRootWiringEvidence(blueprint, JSON.stringify(blueprint.architecture)))
      .toEqual({ lost: [], unreadable: 0 });
  });

  it.each([
    null, '', 'undefined', '{}', JSON.stringify({ ...blueprint.architecture, modules: [] }),
  ])(
    'reports a missing or weakened policy %s', (actual) => {
      expect(sourceRootWiringEvidence(blueprint, actual)).toEqual({
        lost: ['source-root: blueprint/import-boundary is missing, off, '
          + 'or its architecture policy was weakened'],
        unreadable: 0,
      });
    },
  );
});
