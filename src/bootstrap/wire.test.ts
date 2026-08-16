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

describe('wire · the whitespace shapes a template can ship', () => {
  const PATHS = { '~app/*': ['./src/*'] };

  it('sees an existing paths entry however its colon is spaced', () => {
    // A template writing `"paths" :` already has the entry; patching a second
    // one in leaves a duplicate key in the file.
    expect(wireTsconfigPaths('{\n  "compilerOptions": {\n    "paths" : {}\n  }\n}', PATHS))
      .toEqual({ kind: 'noop' });
  });

  it('finds compilerOptions with or without spaces around its colon', () => {
    const spaced = wireTsconfigPaths(
      '{\n  "compilerOptions" : {\n    "strict": true\n  }\n}',
      PATHS,
    );

    const tight = wireTsconfigPaths('{\n  "compilerOptions":{\n    "strict": true\n  }\n}', PATHS);

    expect(spaced.kind).toBe('patched');
    expect(tight.kind).toBe('patched');
  });

  it('puts back the whole indent it captured, not just its first character', () => {
    const result = wireTsconfigPaths(
      '{\n  "compilerOptions": {\n      "strict": true\n  }\n}',
      PATHS,
    );

    // The capture is what the inserted line sits behind. A partial capture
    // leaves the whitespace it skipped in front of the FOLLOWING line, so the
    // block still looks aligned below while `"paths"` itself is flush left —
    // asserting only the trailing side sees nothing.
    expect((result as { text: string }).text).toContain(
      '"compilerOptions": {\n      "paths": { "~app/*": ["./src/*"] },\n      "strict"',
    );
  });

  it('accepts a defineConfig whose brace is spaced from the paren', () => {
    // `defineConfig( {` is the same call shape with one space in it, and the
    // guard's job is recognising the template — not its formatting.
    const text = 'export default defineConfig( {\n  plugins: [],\n})';

    expect(wireViteAlias(text, '~app').kind).toBe('patched');
  });

  it('declines a vite config whose resolve key is spaced before the colon', () => {
    // The guard exists to keep init away from a config that already resolves
    // aliases. `resolve :` resolves them just as much as `resolve:` does.
    const text = 'export default defineConfig({\n  resolve : { alias: {} },\n})';

    expect(wireViteAlias(text, '~app')).toEqual({ kind: 'unparseable' });
  });
});

describe('wireTsconfigPaths · a tsconfig that arrived with CRLF', () => {
  // Windows checkouts are CRLF by default, so this is the ordinary shape of an
  // adopter's tsconfig there — not an edge case. The insertion point used to be
  // matched with a hard-coded `\n` after the brace, which a CRLF file never has:
  // the result came back `unparseable`, `aliasActions` fell through to an
  // instruct, and init asked a Windows user to add `paths` by hand while doing it
  // for them on posix. Found by the windows leg of the CI matrix.
  const crlf = (lines: string[]) => lines.join('\r\n');

  const JSONC_CRLF = crlf([
    '{',
    '  "compilerOptions": {',
    '    /* Bundler mode */',
    '    "moduleResolution": "bundler",',
    '    "jsx": "react-jsx"',
    '  },',
    '  "include": ["src"]',
    '}',
    '',
  ]);

  it('inserts the alias instead of giving up', () => {
    const result = wireTsconfigPaths(JSONC_CRLF, { '~app/*': ['./src/*'] });

    expect(result.kind).toBe('patched');

    const text = result.kind === 'patched' ? result.text : '';

    expect(text).toContain('"paths": { "~app/*": ["./src/*"] },');
    // The comment is the whole reason this path exists rather than the lossless
    // JSON.parse rewrite, so it has to survive here too.
    expect(text).toContain('/* Bundler mode */');
    expect(text.indexOf('"paths"')).toBeLessThan(text.indexOf('"moduleResolution"'));
  });

  it('leaves the file on one line-ending convention', () => {
    // A lone LF inserted into a CRLF config leaves it mixed — and the emitted
    // config carries `@stylistic/linebreak-style`, so blueprint would be creating
    // a finding in the adopter's own lint with its own edit.
    const result = wireTsconfigPaths(JSONC_CRLF, { '~app/*': ['./src/*'] });
    const text = result.kind === 'patched' ? result.text : '';

    expect(text).not.toMatch(/[^\r]\n/);
    expect(text.split('\r\n').length).toBe(JSONC_CRLF.split('\r\n').length + 1);
  });

  it('still keeps an LF config on LF', () => {
    // The other direction of the same requirement: the ending is read off the
    // file rather than picked, so neither convention is imposed on the other.
    const lf = JSONC_CRLF.split('\r\n').join('\n');
    const result = wireTsconfigPaths(lf, { '~app/*': ['./src/*'] });
    const text = result.kind === 'patched' ? result.text : '';

    expect(text).not.toContain('\r');
    expect(text).toContain('"paths": { "~app/*": ["./src/*"] },');
  });
});
