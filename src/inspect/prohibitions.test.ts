import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { measureProhibitions } from './prohibitions';
import type { ScanResult } from './types';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '@',
    layers: [{ name: 'domain', does: 'policy', mustNot: [
      'render UI',
      { id: 'ui',
        description: 'render UI',
        checks: [{ call: 'divIcon' }],
        exempt: ['src/domain/allowed.ts'] },
    ] }],
  },
};

function scan(...files: string[]): ScanResult {
  return { topDirs: [],
    files: files.map((path) => ({ path,
      segments: path.split('/').slice(1),
      imports: [] })) };
}

describe('measureProhibitions', () => {
  it('retains the declared auto file net while resolving detector availability', () => {
    const configured = structuredClone(blueprint);

    configured.framework = 'auto';

    expect(measureProhibitions(configured, scan('src/domain/View.vue'), 'react')[1])
      .toMatchObject({ reach: 'covered', matchedFiles: ['src/domain/View.vue'],
        files: ['src/domain/**/*.{js,jsx,ts,tsx,vue}'] });
  });

  it('uses the carrier glob matcher for extglob exemptions and dotfiles', () => {
    const configured = structuredClone(blueprint);

    configured.architecture.layers[0].mustNot = [{
      id: 'ui', description: 'UI', checks: [{ call: 'divIcon' }],
      exempt: ['src/domain/@(allowed|legacy).ts'],
    }];

    expect(measureProhibitions(configured, scan(
      'src/domain/allowed.ts',
      'src/domain/legacy.ts',
      'src/domain/.hidden.ts',
      'src/domain/other.ts',
    ))[0].matchedFiles).toEqual(['src/domain/.hidden.ts', 'src/domain/other.ts']);
  });

  it('preserves order and review-only doctrine without inventing lint findings', () => {
    const facts = measureProhibitions(blueprint, scan('src/domain/map.ts'));

    expect(facts.map((fact) => [fact.id, fact.mode, fact.status, fact.reach])).toEqual([
      [null, 'review-only', 'review-only', 'covered'], ['ui', 'executable', 'active', 'covered'],
    ]);

    expect(facts[1]).toMatchObject({
      layer: 'domain', position: 'domain', matchedFiles: ['src/domain/map.ts'],
      files: ['src/domain/**/*.{js,jsx,ts,tsx}'], lintIntegration: 'unverified', severity: 'error',
    });

    expect(facts[1]).not.toHaveProperty('violation');
  });

  it('applies architecture scope, test policy, ignores, and entry exemptions before reach', () => {
    const configured = structuredClone(blueprint);

    configured.architecture.layerFilesIgnore = 'src/domain/generated.ts';
    configured.architecture.testFiles = ['**/*.test.ts'];

    const facts = measureProhibitions(configured, scan(
      'src/domain/allowed.ts', 'src/domain/generated.ts', 'src/domain/a.test.ts', 'src/ui/a.ts',
    ));

    expect(facts[0].matchedFiles).toEqual(['src/domain/allowed.ts']);
    expect(facts[1].matchedFiles).toEqual([]);
    expect(facts[1].reach).toBe('vacuous');
  });

  it('measures every module position and keeps empty positions vacuous', () => {
    const configured = structuredClone(blueprint);

    configured.architecture.modules = [
      { name: 'sales', does: 'sales' }, { name: 'billing', does: 'billing' },
    ];

    configured.emit = { lint: { severity: 'warn' } };

    expect(measureProhibitions(configured, scan('src/sales/domain/a.ts'))
      .filter((fact) => fact.mode === 'executable')
      .map((fact) => [fact.position, fact.reach, fact.severity])).toEqual([
      ['sales/domain', 'covered', 'warn'], ['billing/domain', 'vacuous', 'warn'],
    ]);
  });

  it('keeps empty module topology a future runway even when undeclared source exists', () => {
    const configured = structuredClone(blueprint);

    configured.architecture.modules = [];

    expect(measureProhibitions(configured, scan('src/sales/domain/a.ts'))[1]).toMatchObject({
      position: '<module>/domain', reach: 'runway', matchedFiles: [],
      files: ['src/!(app)/domain/**/*.{js,jsx,ts,tsx}'],
    });
  });

  it('uses custom source root and layer net', () => {
    const configured = structuredClone(blueprint);

    configured.architecture.sourceRoot = 'source';
    configured.architecture.layerFiles = 'source/{layer}/**/*.ts';

    expect(measureProhibitions(configured, scan('source/domain/a.ts', 'src/domain/b.ts'))[1]
      .matchedFiles).toEqual(['source/domain/a.ts']);
  });
});

describe('measured prohibition scope and framework authority', () => {
  it.each([
    ['auto', 'react', 'active'], ['auto', null, 'unavailable'],
    ['vue', 'react', 'unavailable'], ['react', null, 'active'],
  ] as const)('resolves %s with detection %s as %s', (framework, detected, status) => {
    const bp = structuredClone(blueprint);

    bp.framework = framework;

    bp.architecture.layers[0].mustNot = [{ id: 'state', description: 'state',
      checks: [{ capability: 'react-state' }] }];

    expect(measureProhibitions(bp, scan(), detected)[0].status).toBe(status);
  });

  it('matches any alternative net and excludes hidden files using the same matcher', () => {
    const bp = structuredClone(blueprint);

    bp.architecture.layerFiles = ['src/{layer}/**/*.js', 'src/{layer}/**/*.ts'];
    bp.architecture.layerFilesIgnore = '**/hidden/*';

    expect(measureProhibitions(bp,
      scan('src/domain/a.ts', 'src/domain/hidden/.secret.ts'))[1].matchedFiles)
      .toEqual(['src/domain/a.ts']);
  });

  it('has no implicit ignore pattern when none was configured', () => {
    expect(measureProhibitions(blueprint, scan())[0].ignores).toEqual([
      '**/*.test.{js,jsx,ts,tsx,vue}', '**/*.spec.{js,jsx,ts,tsx,vue}',
    ]);
  });
});
