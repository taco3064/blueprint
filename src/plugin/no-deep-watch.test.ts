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

  it('steps over a spread in the options object', () => {
    // `{ ...opts }` is a SpreadElement: it carries no key at all, so the key
    // lookup throws inside the adopter's lint run rather than reporting
    // anything. The second case proves the spread is skipped rather than
    // aborting the search that follows it.
    expect(ruleIds('watch(x, cb, { ...opts });')).toEqual([]);

    expect(ruleIds('watch(x, cb, { ...opts, deep: true });'))
      .toEqual(['blueprint/no-deep-watch']);
  });
});

describe('blueprint/no-deep-watch · what the report says, and where it points', () => {
  const report = (code: string) =>
    linter.verify(code, {
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/no-deep-watch': 'error' },
    })[0];

  it('states the cost and the way out', () => {
    // Only the rule id was ever asserted, so the entire message could go empty
    // and the suite would not notice. The id tells an adopter which rule fired;
    // the message is the only place they learn why deep watching costs what it
    // costs, and what to do instead.
    const message = report('watch(x, cb, { deep: true });')?.message ?? '';

    expect(message).toContain('traverses the whole source on every change');
    expect(message).toContain('cost = work × frequency');
    expect(message).toContain('Watch a specific path instead, or restructure the state');
  });

  it('points at the deep option rather than the watch call', () => {
    // The report node is the offending property, and a real watch spans several
    // lines. Reporting the call instead puts the editor's cursor on `watch(` and
    // leaves the author hunting for which option in the object was the problem.
    const out = report([
      'watch(',
      '  source,',
      '  cb,',
      '  { immediate: true, deep: true },',
      ');',
    ].join('\n'));

    expect(out?.line).toBe(4);
  });
});
