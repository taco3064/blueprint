import { describe, expect, it } from 'vitest';
import { defineBlueprint } from '../operational-contract';
import type { Blueprint, RuleSetting } from './types';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'domain', does: 'Logic' }] },
};

describe('moduleDependencySync settings', () => {
  it.each(['error', 'warn', 'off'] as const)('accepts standard %s tier forms', (tier) => {
    for (const setting of [tier, { tier }]) {
      const config = { ...blueprint, rules: { moduleDependencySync: setting } };

      expect(defineBlueprint(config)).toBe(config);
    }
  });

  it.each([0, 1, 2, 'strict', null, {}, { tier: 'fatal' }])(
    'rejects invalid tiers %j', (setting) => {
      expect(() => defineBlueprint({
        ...blueprint, rules: { moduleDependencySync: setting as RuleSetting },
      })).toThrow(/invalid tier/);
    },
  );

  it.each([{ value: 0 }, { value: 1 }, { custom: true }])(
    'rejects non-tier options %j even for an off gate', (options) => {
      for (const tier of ['error', 'off'] as const) {
        expect(() => defineBlueprint({
          ...blueprint, rules: { moduleDependencySync: { tier, ...options } },
        })).toThrow(/Unknown key/);
      }
    },
  );

  it('retains other rules numeric and custom options', () => {
    const config: Blueprint = {
      ...blueprint,
      rules: { maxLines: { tier: 'error', value: 1 }, custom: { tier: 'warn', extra: true } },
    };

    expect(defineBlueprint(config)).toBe(config);
    expect(defineBlueprint(blueprint)).toBe(blueprint);
  });
});
