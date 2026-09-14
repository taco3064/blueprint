import { expect, it } from 'vitest';
import { patchTsconfigPaths } from './alias';
import { insertJsonMembers } from './alias-json';

it.each(['\n', '\r\n'])('preserves every existing byte when inserting paths (%j)', (eol) => {
  const text = [
    '{', '  "compilerOptions": {', '    "paths": {',
    '      "~app/*": ["./src/app/*"],', '      "~pages/*": ["./src/pages/*"]',
    '    }', '  },', '  "exclude": ["node_modules", "dist", "build", "coverage"]', '}', '',
  ].join(eol);

  const added = '"~src/*": ["./src/*"],' + eol + '      ';
  const result = patchTsconfigPaths(text, { '~src/*': ['./src/*'] });

  expect(result).toEqual({ kind: 'patched', text: text.replace('"~app/*"', added + '"~app/*"') });
});

it.each([
  '{}', '{"compilerOptions":{}}', '{"compilerOptions":{"paths":{}}}',
])('inserts into an empty object without reformatting unrelated content: %s', (text) => {
  const result = patchTsconfigPaths(text, { '~src/*': ['./src/*'], '~other/*': ['./other/*'] });

  expect(result.kind).toBe('patched');

  const parsed = JSON.parse((result as { text: string }).text);

  expect(parsed.compilerOptions.paths).toEqual({
    '~src/*': ['./src/*'], '~other/*': ['./other/*'],
  });
});

it.each([
  '{"compilerOptions":{"paths":3}}',
  '{"compilerOptions":{},"compilerOptions":{"paths":{}}}',
  '{"compilerOptions":{"paths":{},"paths":{}}}',
])('refuses ambiguous or invalid object paths: %s', (text) => {
  expect(patchTsconfigPaths(text, { '~src/*': ['./src/*'] })).toEqual({ kind: 'unparseable' });
});

it('rejects an absent insertion path', () => {
  expect(insertJsonMembers('{}', ['missing'], { alias: ['src'] })).toBeNull();
});
