import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { importBoundary } from './import-boundary';

const architecture: ArchitectureDef = {
  alias: '~app',
  modules: [
    { name: 'account', does: 'account' },
    { name: 'billing', does: 'billing' },
  ],
  layers: [{ name: 'services', does: 'I/O' }],
};

function messages(code: string, filename = 'src/account/index.js') {
  return new Linter({ configType: 'flat' }).verify(code, [{
    files: ['**/*.js'],
    plugins: { blueprint: { rules: { 'import-boundary': importBoundary } } },
    rules: { 'blueprint/import-boundary': ['error', { architecture }] },
  }], { filename }).map(({ ruleId, messageId, message }) => ({ ruleId, messageId, message }));
}

describe('root-unit diagnostic evidence', () => {
  it.each([
    'import "~app/account/Invoice";',
    'import("~app/account/Invoice");',
  ])('names the same-root alias in %s', (code) => {
    expect(messages(code)).toEqual([{
      ruleId: 'blueprint/import-boundary',
      messageId: 'rootAlias',
      message: '🚫 Same-root import "~app/account/Invoice" via an alias — use a relative path.',
    }]);
  });

  it.each(['import "./billing";', 'import("./billing");'])(
    'names the relative spelling and its legal bare replacement in %s', (code) => {
      expect(messages(code, 'src/main.js')).toEqual([{
        ruleId: 'blueprint/import-boundary',
        messageId: 'rootCanonical',
        message: '🚫 "./billing" crosses a root-unit boundary — '
          + 'use the canonical bare module alias "~app/billing".',
      }]);
    },
  );

  it('reports a prohibited dynamic bare root exactly once', () => {
    expect(messages('import("~app/billing");')).toEqual([{
      ruleId: 'blueprint/import-boundary',
      messageId: 'flow',
      message: '🚫 "~app/billing" violates the module dependency graph.',
    }]);
  });

  it('reports dynamic privacy and prohibited flow once each without an illegal suggestion', () => {
    expect(messages('import("~app/billing/Invoice");')).toEqual([{
      ruleId: 'blueprint/import-boundary',
      messageId: 'rootPrivate',
      message: '🚫 "~app/billing/Invoice" reaches inside a root unit.',
    }, {
      ruleId: 'blueprint/import-boundary',
      messageId: 'flow',
      message: '🚫 "~app/billing/Invoice" violates the module dependency graph.',
    }]);
  });
});
