import { describe, expect, it } from 'vitest';
import { validateBlueprint } from './defineBlueprint';
import { validateProhibitions } from './prohibition-validation';
import { ConfigValidationError } from './validation';
import type { ExecutableMustNot, Framework, LayerDef } from './types';

const entry = (): ExecutableMustNot => ({ id: 'render-ui',
  description: 'No rendering',
  checks: [{ call: 'divIcon' }] });

const layer = (mustNot: unknown): LayerDef => ({ name: 'domain',
  does: 'policy',
  mustNot: mustNot as LayerDef['mustNot'] });

describe('executable prohibition diagnostic and normalization boundaries', () => {
  it.each([{}, { call: 'x', global: 'x' }])(
    'reports the discriminant contract for %j', (check) => {
      expect(() => validateProhibitions(layer([{ ...entry(), checks: [check] }]), 'auto'))
        .toThrowError(expect.objectContaining({ fact: {
          kind: 'must-not',
          layer: 'domain',
          reason: 'Each check must have exactly one capability, package, global, '
            + 'or call discriminant.',
        } }));
    },
  );

  it.each([undefined, 42, true])('reports a non-object entry for %j', (value) => {
    expect(() => validateProhibitions(layer([value]), 'auto'))
      .toThrowError(expect.objectContaining({ fact: {
        kind: 'must-not',
        layer: 'domain',
        reason: 'Executable entries and checks must be objects.',
      } }));
  });

  it.each([undefined, 42, true, 'call'])('reports a non-object check for %j', (value) => {
    expect(() => validateProhibitions(layer([{ ...entry(), checks: [value] }]), 'auto'))
      .toThrowError(expect.objectContaining({ fact: {
        kind: 'must-not',
        layer: 'domain',
        reason: 'Executable entries and checks must be objects.',
      } }));
  });

  it.each([undefined, false])('distinguishes pattern matching from pattern=%j', (pattern) => {
    const checks = [{ package: 'leaflet', pattern: true }, { package: 'leaflet', pattern }];

    expect(() => validateProhibitions(layer([{ ...entry(), checks }]), 'auto')).not.toThrow();
  });

  it('accepts a colon inside a project-relative exemption path', () => {
    expect(() => validateProhibitions(layer([{ ...entry(), exempt: ['src/a:b/**'] }]), 'auto'))
      .not.toThrow();
  });
});

describe('executable prohibition validation', () => {
  it.each(['a', 'a0', 'a-0'])('accepts valid id boundary %s', (id) => {
    expect(() => validateProhibitions(layer([{ ...entry(), id }]), 'auto')).not.toThrow();
  });

  it.each([undefined,
    [],
    ['',
      ' ',
      'import services',
      'import services']])('preserves legacy string acceptance: %j',
    (entries) => {
      expect(() => validateProhibitions(layer(entries), 'auto')).not.toThrow();
    });

  it.each([
    null, {}, 'prose', [null], [[]], [42],
    [{ ...entry(), extra: true }], [{ ...entry(), id: '' }], [{ ...entry(), id: 4 }],
    [{ ...entry(), id: 'Bad' }], [{ ...entry(), id: 'a_b' }], [entry(), entry()],
    [{ ...entry(), description: '' }], [{ ...entry(), description: 2 }],
    [{ ...entry(), checks: [] }], [{ ...entry(), checks: null }],
    [{ ...entry(), checks: [null] }], [{ ...entry(), checks: [[]] }],
    [{ ...entry(), checks: [{}] }], [{ ...entry(), checks: [{ call: 'x', global: 'x' }] }],
    [{ ...entry(), checks: [{ call: 'x', extra: true }] }],
    [{ ...entry(), checks: [{ package: 'x', exempt: [] }] }],
    [{ ...entry(), checks: [{ call: '' }] }], [{ ...entry(), checks: [{ global: 1 }] }],
    [{ ...entry(), checks: [{ capability: 'missing' }] }],
    [{ ...entry(), checks: [{ capability: 'toString' }] }],
    [{ ...entry(), checks: [{ package: 'x', pattern: 'yes' }] }],
    [{ ...entry(), checks: [{ package: 'x', imports: [] }] }],
    [{ ...entry(), checks: [{ package: 'x', imports: 'x' }] }],
    [{ ...entry(), checks: [{ package: 'x', imports: [''] }] }],
    [{ ...entry(), checks: [{ package: 'x', imports: [5] }] }],
    [{ ...entry(), checks: [{ package: 'x', imports: ['x', 'x'] }] }],
    [{ ...entry(), checks: [{ call: 'x' }, { call: 'x' }] }],
    [{ ...entry(), checks: [{ package: 'x' }, { package: 'x', pattern: false }] }],
    [{ ...entry(),
      checks: [{ package: 'x',
        imports: ['a',
          'b'] },
      { imports: ['b',
        'a'],
      package: 'x' }] }],
  ])('rejects invalid declaration %j with config facts', (entries) => {
    try {
      validateProhibitions(layer(entries), 'auto');
      expect.fail('invalid declaration accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);

      expect((error as ConfigValidationError).fact).toMatchObject({ kind: 'must-not',
        layer: 'domain' });
    }
  });

  it.each([null,
    '',
    ['/src/**'],
    ['C:/src/**'],
    ['C:src/**'],
    ['../src/**'],
    ['src/../**'],
    ['src\\**'],
    [''],
    [4]])('rejects nonportable exemption %j',
    (exempt) => {
      expect(() => validateProhibitions(layer([{ ...entry(),
        exempt }]),
      'auto')).toThrow(ConfigValidationError);
    });

  it('accepts all discriminants, ordered checks, optional booleans, symbols, '
    + 'and relative globs', () => {
    const declaration = { ...entry(), exempt: ['src/**', '**/*.test.ts'], checks: [
      { capability: 'render-ui' }, { package: 'leaflet' }, { package: '@org/*', pattern: true },
      { package: 'leaflet', pattern: false, imports: ['default', 'Icon'] },
      { global: 'WebSocket' }, { call: 'divIcon' },
    ] };

    const before = JSON.stringify(declaration);

    expect(() => validateProhibitions(layer([declaration]), 'auto')).not.toThrow();
    expect(JSON.stringify(declaration)).toBe(before);
    expect(() => validateProhibitions(layer([{ ...entry(), exempt: [] }]), 'react')).not.toThrow();
  });

  it.each([
    ['react-state', 'react'], ['react-lifecycle', 'react'],
    ['vue-reactivity', 'vue'], ['vue-lifecycle', 'vue'],
  ] as const)('requires compatible framework for %s', (capability, framework) => {
    const definition = layer([{ ...entry(), checks: [{ capability }] }]);

    expect(() => validateProhibitions(definition, framework)).not.toThrow();
    expect(() => validateProhibitions(definition, 'auto')).not.toThrow();

    expect(() => validateProhibitions(definition,
      framework === 'react' ? 'vue' : 'react')).toThrow(ConfigValidationError);
  });

  it.each(['auto',
    'react',
    'vue'] as Framework[])('integrates validation and protects carrier with %s',
    (framework) => {
      const bp = { framework, architecture: { alias: '@', layers: [layer([entry()])] } };

      expect(validateBlueprint(bp)).toBe(bp);
      bp.architecture.layers[0].lintOverrides = { 'blueprint/must-not': 'off' };
      expect(() => validateBlueprint(bp)).toThrow(ConfigValidationError);
    });
});
