import globals from 'globals';
import imports from 'eslint-plugin-import-x';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// From the source, never this package's own name: inside this repo that
// specifier resolves through `exports` to `./dist/index.js`, so a lint run
// wired that way would enforce whatever was last built. ESLint loads this file
// through jiti, which resolves the entry-only directory imports plain Node
// cannot. The name is deliberately not written anywhere in this file, and does
// not need to be: doctor's "eslint wired to emitLint" check reads the
// `...emitLint(` spread below, which is the wiring itself. A comment carrying
// the package name would turn the same check green while wiring nothing, which
// is the hatch this file used to have.
import { emitLint, validateBlueprint } from './src';
import blueprint from './blueprint.config.mjs';

// Formatting is ESLint-driven (no Prettier). `customize` reproduces the old
// Prettier settings: 2-space indent, single quotes, semicolons, trailing
// commas, 1tbs braces.
const formatting = stylistic.configs.customize({
  indent: 2,
  quotes: 'single',
  semi: true,
  arrowParens: true,
  braceStyle: '1tbs',
  commaDangle: 'always-multiline',
  blockSpacing: true,
  quoteProps: 'as-needed',
});

export default defineConfig([
  // `.stryker-tmp` holds Stryker's sandboxed copy of src (mutated, `@ts-nocheck`d);
  // `reports` its HTML output. Both are generated — never lint them.
  //
  // `.claude/worktrees` is the same class arriving from a different direction: a git
  // worktree checked out INSIDE the repo carries a second copy of everything,
  // conformance fixtures included, and those are deliberately-bad code. `eslint .`
  // walked into one and reported 755 errors about a sibling checkout. `fixtures` is
  // already here for the copy at the top level; this is the copy one level down.
  globalIgnores([
    'dist',
    'coverage',
    'docs',
    'examples',
    'fixtures',
    '.stryker-tmp',
    'reports',
    '.claude/worktrees',
  ]),
  // The parser and the recommended sets stay on every `.ts` file — the emitted
  // config declares rules, never a language. Narrowing this entry to the house
  // globs below would leave `src/` parsed by espree.
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
  },
  // The house rules, scoped to what the emitted config does not reach, so
  // exactly one entry owns any file's formatting. blueprint's globs are
  // `src/{layer}/**`, and the `ignores` is derived from the blueprint rather
  // than restated — a layer added there must not silently gain a second owner.
  //
  // What stays outside: the root wiring files, `src/index.ts` (the package entry
  // belongs to no layer), and `test/` — the conformance DSL and the adoption e2e,
  // which ship nothing and therefore live outside `sourceRoot` rather than being
  // declared as a layer. Being outside the layer nets is what puts them here, and
  // this entry is what keeps them governed by something.
  {
    files: ['**/*.ts'],
    ignores: blueprint.architecture.layers.map(
      (layer) => `${blueprint.architecture.sourceRoot}/${layer.name}/**`,
    ),
    plugins: {
      '@stylistic': stylistic,
      'import-x': imports,
    },
    rules: {
      ...formatting.rules,
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: 'const', next: 'expression' },
        { blankLine: 'always', prev: 'let', next: 'expression' },
        { blankLine: 'always', prev: 'class', next: '*' },
        { blankLine: 'always', prev: 'function', next: '*' },
        { blankLine: 'always', prev: 'multiline-expression', next: '*' },
        { blankLine: 'always', prev: 'multiline-const', next: '*' },
        { blankLine: 'always', prev: 'multiline-let', next: '*' },
        { blankLine: 'always', prev: '*', next: 'block-like' },
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: '*', next: 'multiline-expression' },
        { blankLine: 'always', prev: '*', next: 'multiline-const' },
        { blankLine: 'always', prev: '*', next: 'multiline-let' },
        { blankLine: 'always', prev: '*', next: 'break' },
        { blankLine: 'always', prev: '*', next: 'continue' },
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'throw' },
      ],
    },
  },
  // Last in the array, so the emitted entries win wherever they and the house
  // rules both match. `validateBlueprint` is what the skipped `defineBlueprint`
  // was doing — the config is a plain literal, and this is where it is checked.
  ...emitLint(validateBlueprint(blueprint), {
    typescript: tseslint.plugin,
    stylistic,
    imports,
  }),
]);
