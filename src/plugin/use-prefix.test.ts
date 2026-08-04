import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

function messages(code: string, options?: { prefix: string }): string[] {
  return linter
    .verify(code, {
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/use-prefix': options ? ['error', options] : 'error' },
    })
    .map((message) => message.message);
}

describe('blueprint/use-prefix', () => {
  it('flags exported functions without the prefix', () => {
    expect(messages('export function getCart() {}')).toHaveLength(1);
    expect(messages('export const cart = () => {};')).toHaveLength(1);
    expect(messages('export const cart = function () {};')).toHaveLength(1);
  });

  it('requires a capital right after the prefix', () => {
    expect(messages('export function use() {}')).toHaveLength(1);
    expect(messages('export const used = () => {};')).toHaveLength(1);
  });

  it('allows prefixed exported functions', () => {
    expect(messages('export function useCart() {}')).toEqual([]);
    expect(messages('export const useCart = () => {};')).toEqual([]);
  });

  it('passes everything that cannot be proven a hook', () => {
    expect(messages('export const LIMIT = 3;')).toEqual([]);
    expect(messages('export { cart } from "./cart";')).toEqual([]);
    expect(messages('export default function () {}')).toEqual([]);
    expect(messages('export const [a, b] = pair;')).toEqual([]);
    expect(messages('export let cart;')).toEqual([]);
    expect(messages('export class Cart {}')).toEqual([]);
  });

  it('honors a custom prefix', () => {
    expect(messages('export function withCart() {}', { prefix: 'with' })).toEqual([]);
    expect(messages('export function useCart() {}', { prefix: 'with' })).toHaveLength(1);
  });

  it('reports the offending name in the message', () => {
    expect(messages('export function getCart() {}')[0]).toContain('"getCart"');
  });

  it('wants the capital immediately after the prefix, not merely somewhere', () => {
    // `userName` opens with `use` and does contain a capital — just not at the
    // position that makes a name `useX`. Looking anywhere in the name would
    // wave through every `user*` helper in the layer.
    expect(messages('export function userName() {}')).toHaveLength(1);
    expect(messages('export const userProfile = () => {};')).toHaveLength(1);
  });

  it('leaves a destructured export alone even when it initializes to a function', () => {
    // The id is an ObjectPattern — there is no single name to judge. Reading
    // it as an Identifier hands `check` an undefined name, which throws inside
    // an adopter's lint run rather than reporting anything.
    expect(messages('export const { cart } = function () {};')).toEqual([]);
    expect(messages('export const [first] = function () {};')).toEqual([]);
  });

  it('states its own purpose in meta, which is what adopters actually read', () => {
    // This plugin ships into other repos, where `eslint --print-config` and
    // every editor tooltip render this text. An empty docs block is invisible
    // here and a regression there.
    expect(plugin.rules?.['use-prefix']?.meta?.docs?.description).toContain('hook prefix');
  });

  it('rejects a misspelled or mistyped option instead of quietly ignoring it', () => {
    const withOption = (option: unknown): void => {
      linter.verify('export function getCart() {}', {
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'blueprint/use-prefix': ['error', option] } as never,
      });
    };

    // The schema is the whole of what stands between a typo in an adopter's
    // eslint config and a rule that silently runs on the default prefix.
    expect(() => withOption({ prefixx: 'with' })).toThrow();
    expect(() => withOption({ prefix: 123 })).toThrow();
    expect(() => withOption({ prefix: 'with' })).not.toThrow();
  });
});
