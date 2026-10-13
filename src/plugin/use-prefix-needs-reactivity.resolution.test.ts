import { Linter } from 'eslint';
import { expect, it } from 'vitest';
import { plugin } from './plugin';

it.each([
  {}, { alias: '~app' }, { sourceRoot: 'src' },
  { alias: '', sourceRoot: 'src' }, { alias: '~app', sourceRoot: '' },
  { alias: 1, sourceRoot: 'src' }, { alias: '~app', sourceRoot: 1 },
  { alias: '~app', sourceRoot: 'src', basePath: 1 },
  { alias: '~app', sourceRoot: 'src', additionalAliases: { '@': 'src' } },
])('rejects incomplete or unknown resolution configuration: %j', (options) => {
  expect(() => new Linter().verify('export const useView = () => 1;', {
    plugins: { blueprint: plugin },
    rules: { 'blueprint/use-prefix-needs-reactivity': ['error', options] },
  }, { filename: 'useView.js' })).toThrow('blueprint/use-prefix-needs-reactivity');
});
