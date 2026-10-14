import path from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { resolveProhibitions } from '../config';
import { mustNot } from './must-not';

const options = {
  prohibitions: resolveProhibitions({
    name: 'domain', does: 'policy', mustNot: [
      'fetch',
      { id: 'mixed', description: 'mixed', checks: [
        { capability: 'react-state' }, { call: 'divIcon' }, { global: 'divIcon' },
      ] },
    ],
  }, { framework: 'auto' }),
};

describe('must-not resolved plan execution', () => {
  it('enforces available siblings of unavailable checks, in declared OR order', () => {
    const messages = new Linter().verify('fetch(); divIcon()', [{
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['warn', options] },
    }]);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.severity)).toEqual([1, 1]);
    expect(messages[0].message).toContain('syntactic');
    expect(messages[1].message).toContain('global');
  });

  it('resolves exemptions against the supplied application root', () => {
    const scoped = {
      basePath: 'apps/web',
      prohibitions: resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
        id: 'call', description: 'call', checks: [{ call: 'divIcon' }],
        exempt: ['src/domain/exempt.js'],
      }] }),
    };

    const config: Linter.Config[] = [{
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['error', scoped] },
    }];

    expect(new Linter().verify('divIcon()', config, {
      filename: path.resolve('apps/web/src/domain/exempt.js'),
    })).toEqual([]);

    expect(new Linter().verify('divIcon()', config, {
      filename: path.resolve('apps/web/src/domain/other.js'),
    })).toHaveLength(1);
  });
});

describe('must-not configured ESLint globals', () => {
  it('treats configured globals as unshadowed and local parameters as bindings', () => {
    const prohibitions = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'globals', description: 'globals', checks: [
        { global: 'fetch' }, { package: 'leaflet' },
      ],
    }] });

    const config: Linter.Config[] = [{
      languageOptions: { globals: { fetch: 'readonly', require: 'readonly' } },
      plugins: { blueprint: { rules: { 'must-not': mustNot } } },
      rules: { 'blueprint/must-not': ['error', { prohibitions }] },
    }];

    expect(new Linter().verify('fetch(); require("leaflet")', config)).toHaveLength(2);

    expect(new Linter().verify(
      'function f(fetch, require) { fetch(); require("leaflet") }', config,
    )).toEqual([]);
  });
});
