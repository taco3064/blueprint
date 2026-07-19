import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

function messages(code: string, filename: string): string[] {
  return linter
    .verify(code, {
      files: ['**/*.{js,ts,jsx,tsx}'],
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/use-prefix-needs-reactivity': 'warn' },
    }, { filename })
    .map((message) => message.message);
}

describe('blueprint/use-prefix-needs-reactivity', () => {
  it('passes a use-named file that calls a reactive API', () => {
    expect(messages('export const useCart = () => ref(0);', 'src/hooks/useCart/useCart.ts')).toEqual([]);

    expect(
      messages('export function useCart() { return React.useState(0); }', 'useCart.ts'),
    ).toEqual([]);
  });

  it('flags a use-named file with no reactive/lifecycle call', () => {
    const out = messages('export const useCart = (a, b) => a + b;', 'src/hooks/useCart/useCart.ts');

    expect(out).toHaveLength(1);
    expect(out[0]).toContain('"useCart"');
    expect(out[0]).toContain('pure function');
  });

  it('is not fooled by non-reactive calls, member or otherwise', () => {
    expect(messages('export const useX = () => Math.max(1, 2);', 'useX.ts')).toHaveLength(1);
    expect(messages('export const useX = () => fn()();', 'useX.ts')).toHaveLength(1);
  });

  it('ignores files without the use prefix, and strips test suffixes first', () => {
    expect(messages('export const cart = (a) => a;', 'src/utils/cart.ts')).toEqual([]);
    expect(messages('export const used = (a) => a;', 'used.ts')).toEqual([]);

    // useCart.test.ts reduces to base "useCart" — still subject to the rule.
    expect(messages('export const t = 1;', 'useCart.test.ts')).toHaveLength(1);
  });
});
