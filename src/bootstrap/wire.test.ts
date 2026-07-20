import { describe, expect, it } from 'vitest';

import { wireTsconfigPaths, wireViteAlias } from './wire';

const VITE_REACT = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;

describe('wireViteAlias', () => {
  it('inserts resolve.alias and the node:url import into a template config', () => {
    const result = wireViteAlias(VITE_REACT, '~app');

    expect(result.kind).toBe('patched');

    const text = result.kind === 'patched' ? result.text : '';

    expect(text).toContain('import { fileURLToPath, URL } from \'node:url\'');
    expect(text).toContain('\'~app\': fileURLToPath(new URL(\'./src\', import.meta.url))');
    expect(text.indexOf('resolve:')).toBeGreaterThan(text.indexOf('defineConfig({'));
    expect(text).toContain('plugins: [react()]');
  });

  it('does not duplicate an existing node:url import', () => {
    const withImport = `import { fileURLToPath, URL } from 'node:url'\n${VITE_REACT}`;
    const result = wireViteAlias(withImport, '~app');

    const text = result.kind === 'patched' ? result.text : '';

    expect(text.match(/from 'node:url'/g)).toHaveLength(1);
  });

  it('refuses a config that already has a resolve section', () => {
    const wired = VITE_REACT.replace('plugins: [react()],', 'plugins: [react()],\n  resolve: {},');

    expect(wireViteAlias(wired, '~app')).toEqual({ kind: 'unparseable' });
  });

  it('refuses non-template shapes (function config, no object literal)', () => {
    expect(wireViteAlias('export default defineConfig(() => ({}))', '~app')).toEqual({
      kind: 'unparseable',
    });

    expect(wireViteAlias('module.exports = {}', '~app')).toEqual({ kind: 'unparseable' });
  });
});

describe('wireTsconfigPaths', () => {
  const JSONC = `{
  "compilerOptions": {
    /* Bundler mode */
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
`;

  it('inserts paths after compilerOptions, preserving comments and indentation', () => {
    const result = wireTsconfigPaths(JSONC, { '~app/*': ['./src/*'] });

    expect(result.kind).toBe('patched');

    const text = result.kind === 'patched' ? result.text : '';

    expect(text).toContain('"paths": { "~app/*": ["./src/*"] },');
    expect(text).toContain('/* Bundler mode */');
    expect(text.indexOf('"paths"')).toBeLessThan(text.indexOf('"moduleResolution"'));
  });

  it('is a noop when paths already exist', () => {
    expect(
      wireTsconfigPaths('{ "compilerOptions": { "paths": {} } }', { '~app/*': ['./src/*'] }),
    ).toEqual({ kind: 'noop' });
  });

  it('refuses shapes without a compilerOptions block on its own line', () => {
    expect(wireTsconfigPaths('{ "extends": "./base.json" }', { '~app/*': ['./src/*'] })).toEqual({
      kind: 'unparseable',
    });
  });
});
