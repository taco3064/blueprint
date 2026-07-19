import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

function ruleIds(code: string): (string | null)[] {
  return linter
    .verify(code, {
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/no-deep-watch': 'error' },
    })
    .map((message) => message.ruleId);
}

describe('blueprint/no-deep-watch', () => {
  it('flags a truthy deep option, whatever the key style', () => {
    expect(ruleIds('watch(x, cb, { deep: true });')).toEqual(['blueprint/no-deep-watch']);
    expect(ruleIds('watch(x, cb, { immediate: true, deep: true });')).toEqual(['blueprint/no-deep-watch']);
    expect(ruleIds('watch(x, cb, { "deep": true });')).toEqual(['blueprint/no-deep-watch']);
    expect(ruleIds('watch(x, cb, { deep: 1 });')).toEqual(['blueprint/no-deep-watch']);
  });

  it('allows watches without a truthy deep literal', () => {
    expect(ruleIds('watch(x, cb);')).toEqual([]);
    expect(ruleIds('watch(x, cb, { immediate: true });')).toEqual([]);
    expect(ruleIds('watch(x, cb, { deep: false });')).toEqual([]);
    expect(ruleIds('watch(x, cb, { deep: 0 });')).toEqual([]);
  });

  it('skips what it cannot prove statically', () => {
    // An options identifier, a computed key, or a non-literal value.
    expect(ruleIds('watch(x, cb, options);')).toEqual([]);
    expect(ruleIds('watch(x, cb, { [key]: true });')).toEqual([]);
    expect(ruleIds('watch(x, cb, { deep: isDeep });')).toEqual([]);
  });

  it('only matches a plain watch() call', () => {
    expect(ruleIds('this.$watch(x, cb, { deep: true });')).toEqual([]);
    expect(ruleIds('scope.watch(x, cb, { deep: true });')).toEqual([]);
    expect(ruleIds('rewatch(x, cb, { deep: true });')).toEqual([]);
  });
});
