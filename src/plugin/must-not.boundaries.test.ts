import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import { resolveProhibitions } from '../config';
import type { MustNotCheck } from '../config';
import { mustNot } from './must-not';

function lint(code: string, check: MustNotCheck, vue = false) {
  const prohibitions = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
    id: 'boundary', description: 'keep policy pure', checks: [check],
  }] }, { framework: vue ? 'vue' : 'react' });

  return new Linter().verify(code, [{
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parser: vue ? vueParser : tsParser,
      parserOptions: { parser: tsParser },
    },
    plugins: { blueprint: { rules: { 'must-not': mustNot } } },
    rules: { 'blueprint/must-not': ['error', { prohibitions }] },
  }], { filename: vue ? 'unit.vue' : 'unit.ts' });
}

describe('must-not identity boundaries', () => {
  it.each([
    'L[divIcon]()',
    'L[42]()',
  ])('does not interpret computed values as declared names: %s', (source) => {
    expect(lint(source, { call: 'divIcon' })).toEqual([]);
  });

  it.each([
    'class X extends Base { [render]() {} }',
    'class X extends Base { f() { this.other = {}; } }',
    'class X extends Base { f() { other = this.state; } }',
    'class X extends Base { f() { this.state; } }',
    'class X extends Base { f() { this.state === other; } }',
    'class X extends Base { f() { this.render = other; } }',
  ])('keeps reads and unknown instance members outside state/render checks: %s', (source) => {
    const code = `import { Component as Base } from 'react'; ${source}`;

    expect(lint(code, { capability: 'react-state' })).toEqual([]);
    expect(lint(code, { capability: 'render-ui' })).toEqual([]);
  });

  it.each(['other.sendBeacon()', 'navigator[sendBeacon]()', '({}).sendBeacon()'])(
    'does not infer the navigator member from %s', (source) => {
      expect(lint(source, { capability: 'network-io' })).toEqual([]);
    },
  );

  it('allows imported calls for capabilities without a bound-call catalog', () => {
    expect(lint('import { run } from "other"; run()', { capability: 'network-io' }))
      .toEqual([]);
  });

  it('allows relative package references when an explicit pattern does not match', () => {
    expect(lint('import "./local"', { package: 'leaf*', pattern: true })).toEqual([]);
    expect(lint('import "../local"', { package: 'leaf*', pattern: true })).toEqual([]);
  });

  it('detects a forbidden symbol among allowed siblings', () => {
    expect(lint('import { other, divIcon } from "leaflet"', {
      package: 'leaflet', imports: ['divIcon'],
    })).toHaveLength(1);

    expect(lint('export { other as renamed } from "leaflet"', {
      package: 'leaflet', imports: ['divIcon'],
    })).toEqual([]);
  });

  it('does not treat a script literal as template text', () => {
    expect(lint('<script>const label = "hello";</script>', { capability: 'render-ui' }, true))
      .toEqual([]);
  });

  it('does not treat an empty interpolation as rendering', () => {
    expect(lint('<template>{{ }}</template>', { capability: 'render-ui' }, true)).toEqual([]);
  });

  it('keeps project globals in script blocks rather than template tag names', () => {
    expect(lint('<template><WebSocket/></template>', { global: 'WebSocket' }, true)).toEqual([]);
  });

  it('does not execute checks carried by a non-executable plan entry', () => {
    const prohibitions = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'call', description: 'call', checks: [{ call: 'divIcon' }],
    }] });

    expect(new Linter().verify('divIcon()', [{
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['error', {
        prohibitions: prohibitions.map((entry) => ({ ...entry, mode: 'review-only' })),
      }] },
    }])).toEqual([]);
  });

  it('honors exemptions that match hidden source files', () => {
    const prohibitions = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'call', description: 'call', checks: [{ call: 'divIcon' }], exempt: ['**/allowed.ts'],
    }] });

    const config: Linter.Config[] = [{
      files: ['**/*.ts'],
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['error', { prohibitions }] },
    }];

    expect(new Linter().verify('divIcon()', config, { filename: 'src/.private/allowed.ts' }))
      .toEqual([]);

    expect(new Linter().verify('divIcon()', config, { filename: 'src/.private/other.ts' }))
      .toHaveLength(1);
  });

  it('rejects non-object rule options at the ESLint schema boundary', () => {
    expect(() => new Linter().verify('', [{
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['error', []] },
    }])).toThrow('should be object');
  });
});
