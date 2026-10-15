import { describe, expect, it } from 'vitest';
import { resolveArchitecture } from './resolved';
import { prohibitionGateEvidence, resolveProhibitions } from './prohibitions';
import type { ProhibitionContext, ResolvedProhibition } from './prohibitions';
import type { LayerDef, MustNotCheck } from './types';

function resolve(checks: MustNotCheck[], context: ProhibitionContext = {}) {
  return resolveProhibitions({ name: 'domain',
    does: 'policy',
    mustNot: [{ id: 'ban',
      description: 'Forbidden',
      checks }] },
  context)[0];
}

it('preserves capability limitations instead of substituting package limitations', () => {
  const result = resolve([{ capability: 'react-state' }], { framework: 'react' });

  const limitations = [
    'Framework calls require proven imported bindings, including aliases '
    + 'and namespace members; unrelated names do not match.',
    'Class state ownership and setState use require a proven React '
    + 'Component/PureComponent subclass.',
    'No delegated wrappers, dependency injection, application abstractions, '
    + 'runtime execution, or cross-file value flow are inferred.',
  ];

  expect(result.checks[0].limitations).toEqual(limitations);
  expect(result.limitations).toEqual(limitations);
});

describe('resolved prohibition authority', () => {
  it.each([{ call: 'divIcon' }, { package: 'leaflet' }] as MustNotCheck[])(
    'requires syntax parser support for every detector: %j', (check) => {
      expect(resolve([check], { parserCapabilities: { syntax: false } })).toMatchObject({
        status: 'unavailable', checks: [{
          status: 'unavailable',
          unavailableReason: 'Required source syntax parser support is unavailable.',
        }],
      });

      expect(resolve([check], { parserCapabilities: { syntax: true } }).status).toBe('active');
      expect(resolve([check]).status).toBe('active');
    },
  );

  it('requires framework or explicit parser proof for render-ui with auto detection', () => {
    const checks: MustNotCheck[] = [{ capability: 'render-ui' }];

    expect(resolve(checks).status).toBe('unavailable');
    expect(resolve(checks, { framework: 'auto' }).status).toBe('unavailable');

    expect(resolve(checks, { framework: 'auto', parserCapabilities: { framework: true } }).status)
      .toBe('active');

    expect(resolve(checks, { framework: 'vue' }).status).toBe('active');
  });

  it('preserves doctrine and declaration/check ordering without inferring detectors', () => {
    const layer: LayerDef = { name: 'render-ui', does: 'UI', mustNot: ['', 'render UI', {
      id: 'ban',
      description: 'useState',
      checks: [{ call: 'divIcon' },
        { package: 'leaflet' }],
      exempt: ['**/allowed.ts'],
    }] };

    const result = resolveProhibitions(layer, { severity: 'warn' });

    expect(result.slice(0, 2)).toEqual(['', 'render UI'].map((description) => ({
      layer: 'render-ui',
      id: null,
      description,
      mode: 'review-only',
      status: 'review-only',
      checks: [],
      enforcedBy: null,
      limitations: [],
      reach: 'unmeasured',
      exempt: [],
      severity: 'warn',
      ruleId: 'blueprint/must-not',
    })));

    expect(result[2]).toMatchObject({ id: 'ban',
      description: 'useState',
      mode: 'executable',
      status: 'active',
      enforcedBy: 'lint',
      exempt: ['**/allowed.ts'],
      severity: 'warn' });

    expect(result[2].checks.map((check) => check.check)).toEqual([{ call: 'divIcon' },
      { package: 'leaflet' }]);

    expect(resolveProhibitions({ name: 'domain', does: 'policy' })).toEqual([]);
  });

  it('resolves mixed availability independently of severity and reach', () => {
    const checks: MustNotCheck[] = [{ call: 'divIcon' }, { capability: 'react-state' }];
    const partial = resolve(checks);

    expect(partial.status).toBe('partial');
    expect(partial.severity).toBe('error');
    expect(partial.checks.map((check) => check.status)).toEqual(['available', 'unavailable']);
    expect(partial.checks[1].unavailableReason).toBe('Requires resolved react framework support.');
    expect(resolve(checks, { framework: 'react' }).status).toBe('active');

    expect(resolve([{ capability: 'react-state' }],
      { framework: 'vue',
        severity: 'warn' }).status).toBe('unavailable');
  });

  it.each<MustNotCheck>([{ global: 'WebSocket' },
    { capability: 'network-io' },
    { capability: 'browser-dom' }])('records unavailable reference spaces for %j',
    (check) => {
      expect(resolve([check],
        { parserCapabilities: { typeReferences: false } }).checks[0]).toMatchObject({
        status: 'unavailable',
        unavailableReason: 'The active parser cannot expose required '
          + 'value and type reference spaces.',
      });

      expect(resolve([check],
        { parserCapabilities: { typeReferences: true } }).status).toBe('active');
    });

  it.each<MustNotCheck>([{ capability: 'render-ui' },
    { capability: 'react-state' }])('records missing framework parser for %j',
    (check) => {
      expect(resolve([check],
        { framework: 'react',
          parserCapabilities: { framework: false } }).checks[0].unavailableReason)
        .toBe('Required framework parser support is unavailable.');

      expect(resolve([check],
        { framework: 'react',
          parserCapabilities: { framework: true } }).status).toBe('active');
    });

  it('does not require framework parsing for package or call checks', () => {
    expect(resolve([{ package: 'react' }, { call: 'x' }, { capability: 'routing' }], {
      parserCapabilities: { framework: false, typeReferences: false },
    }).status).toBe('active');
  });
});

describe('prohibition scope and limits', () => {
  it('uses a future module net for runway prohibitions without changing structural scope', () => {
    const definition = { alias: '@', modules: [], sourceRoot: 'app-src', layers: [
      { name: 'domain', does: 'policy' },
    ] };

    const architecture = resolveArchitecture(definition);

    expect(architecture.layerFiles('domain', 'react')).toEqual([]);

    expect(architecture.prohibitionFiles('domain', 'react'))
      .toEqual(['app-src/!(app)/domain/**/*.{js,jsx,ts,tsx}']);

    expect(resolveArchitecture({ ...definition, layerFiles: '{module}/{layer}/*.ts' })
      .prohibitionFiles('domain', 'react')).toEqual(['app-src/!(app)/domain/*.ts']);

    expect(resolveArchitecture({ ...definition, modules: undefined })
      .prohibitionFiles('domain', 'vue')).toEqual(['app-src/domain/**/*.{js,jsx,ts,tsx,vue}']);

    expect(resolveArchitecture({ ...definition, modules: [{ name: 'shop', does: 'shop' }] })
      .prohibitionFiles('domain', 'react', 'shop'))
      .toEqual(['app-src/shop/domain/**/*.{js,jsx,ts,tsx}']);
  });

  it('publishes exact project-check limitations', () => {
    const result = resolve([{ call: 'x' },
      { global: 'x' },
      { package: 'x' },
      { package: 'x/*',
        pattern: true,
        imports: ['default'] }]);

    expect(result.checks[0].limitations[0]).toContain('not semantic identity proof');
    expect(result.checks[1].limitations[0]).toContain('local bindings do not match');

    expect(result.checks[2].limitations).toEqual([
      'Exact package and slash-delimited subpaths; sibling package names do not match.',
      'Static imports and re-exports, including type-only forms, proven '
      + 'CommonJS require and dynamic-import strings; runtime-dependent sources '
      + 'remain unverified.',
    ]);

    expect(result.checks[3].limitations).toEqual([
      'Declared ownership/no-restricted-imports group glob; no package-family expansion.',
      'Exported symbols in static imports and re-exports, including aliases '
      + 'and type-only forms; no CommonJS/dynamic namespace identity, later '
      + 'property access, reassignment, or wrappers.',
    ]);

    expect(result.limitations)
      .toEqual([...new Set(result.checks.flatMap((check) => check.limitations))]);
  });

  it.each([undefined,
    [],
    [{ name: 'app',
      does: 'routes' }],
    [{ name: 'shop',
      does: 'domain' }]])('exposes topology reach for %j',
    (modules) => {
      const architecture = resolveArchitecture({ alias: '@',
        modules,
        layers: [{ name: 'domain',
          does: 'policy',
          mustNot: ['review'] }] },
      { severity: 'warn' });

      expect(architecture.layers[0].prohibitions[0].reach)
        .toBe(modules && modules.every((module) => module.name === 'app')
          ? 'runway'
          : 'unmeasured');

      expect(architecture.layers[0].prohibitions[0].severity).toBe('warn');
    });
});

describe('prohibition gate evidence', () => {
  it.each(['active',
    'partial',
    'unavailable'] as const)('separates detected severity from %s availability',
    (status) => {
      expect(prohibitionGateEvidence({ status,
        severity: 'error',
        violation: true,
        wiring: 'verified' }))
        .toEqual({ gate: 'failed', observation: false, affectsExit: true });

      expect(prohibitionGateEvidence({ status,
        severity: 'warn',
        violation: true,
        wiring: 'verified' }))
        .toEqual({ gate: status === 'active' ? 'passed' : 'unverified',
          observation: true,
          affectsExit: false });
    });

  it.each(['review-only',
    'active',
    'partial',
    'unavailable'] as ResolvedProhibition['status'][])('retains carrier failure precedence for %s',
    (status) => {
      expect(prohibitionGateEvidence({ status, severity: 'warn', wiring: 'failed' }))
        .toEqual({ gate: 'failed', observation: false, affectsExit: true });

      expect(prohibitionGateEvidence({ status, severity: 'error', wiring: 'unverified' }))
        .toEqual({ gate: 'unverified', observation: false, affectsExit: false });

      expect(prohibitionGateEvidence({ status,
        severity: 'warn',
        violation: false,
        wiring: 'verified' }))
        .toEqual({ gate: ['partial',
          'unavailable'].includes(status)
          ? 'unverified'
          : 'passed',
        observation: false,
        affectsExit: false });
    });
});
