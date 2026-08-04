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

    // useCart.test.ts reduces to base "useCart" — still subject to the rule,
    // and the message has to name the stripped base. A suffix left on reports a
    // file that does not exist, and a message count cannot see that at all.
    const out = messages('export const t = 1;', 'useCart.test.ts');

    expect(out).toHaveLength(1);
    expect(out[0]).toContain('"useCart"');
  });

  it('reads the prefix only at the start of the name', () => {
    // `mouseUp` contains `useU`. Matching anywhere in the basename would drag
    // every such file into a rule that is about hooks.
    expect(messages('export const mouseUp = (a, b) => a + b;', 'src/hooks/mouseUp.ts'))
      .toEqual([]);
  });

  it('does not read a private method name as a reactive call', () => {
    // `this.#useState()` carries a PrivateIdentifier, not an Identifier.
    // Reading `.name` off it anyway would let any class holding a `#useState`
    // member satisfy the rule without a line of reactivity in sight.
    expect(
      messages(
        'class A { #useState() {} m() { this.#useState(); } }\nexport const useCart = () => new A();',
        'src/hooks/useCart.ts',
      ),
    ).toHaveLength(1);
  });

  it('strips the test and extension suffixes only where they end the name', () => {
    // Both patterns are end-anchored, and a doubled extension is where that
    // shows: stripping mid-name reports a base the file does not have, which
    // sends the reader looking for a file that was never there.
    expect(messages('export const t = 1;', 'useCart.test.ts.ts')[0])
      .toContain('"useCart.test.ts"');

    expect(messages('export const t = 1;', 'useCart.vue.ts')[0])
      .toContain('"useCart.vue"');
  });
});
