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
});
