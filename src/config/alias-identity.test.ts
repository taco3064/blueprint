import { describe, expect, it } from 'vitest';

import { validateAliasIdentity } from './alias-identity';
import { ConfigValidationError } from './validation';

describe('validateAliasIdentity', () => {
  it.each([
    [undefined, undefined],
    [undefined, { '~other': '../shared' }],
    [undefined, { '~app': './src/' }],
    ['.', { '~app': './' }],
    ['/', { '~app': '/' }],
    ['src/app', { '~app': 'src/other/../app/' }],
    ['src/app', { '~app': '.\\src\\app\\' }],
  ])('accepts equivalent or independent aliases: %j / %j', (sourceRoot, additionalAliases) => {
    expect(() => validateAliasIdentity({
      alias: '~app', sourceRoot, additionalAliases, layers: [],
    })).not.toThrow();
  });

  it.each(['../src', '/src', 'other', '../../src'])('rejects a conflicting target %s', (target) => {
    expect(() => validateAliasIdentity({
      alias: '~app', additionalAliases: { '~app': target }, layers: [],
    })).toThrow(ConfigValidationError);
  });
});
