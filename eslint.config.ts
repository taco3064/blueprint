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
// cannot — which is also why no `npm run build` stands in front of `npm run
// lint`.
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

// What the emitted config already owns. Derived from the blueprint rather than
// restated — a layer added there must not silently gain a second owner — and
// hoisted because two house entries below share it. `sourceRoot` is `.` here,
// so this reads `./src/**`; measured, ESLint normalises the prefix away and it
// ignores exactly what `src/**` does.
const layerGlobs = blueprint.architecture.layers.map(
  (layer) => `${blueprint.architecture.sourceRoot}/${layer.name}/**`,
);

// One house contract under two rule ids: `.ts` reaches it through
// typescript-eslint (which turns the core rule off there), `.mjs` through the
// core rule itself. Shared so the two spellings cannot drift apart.
const unusedVars = { argsIgnorePattern: '^_', varsIgnorePattern: '^_' };

export default defineConfig([
  // `.stryker-tmp` holds Stryker's sandboxed copy of src (mutated, `@ts-nocheck`d);
  // `reports` its HTML output. Both are generated — never lint them.
  //
  // `.claude/worktrees` is the same class arriving from a different direction: a git
  // worktree checked out INSIDE the repo carries a second copy of everything,
  // conformance fixtures included, and those are deliberately-bad code. `eslint .`
  // walked into one and reported 755 errors about a sibling checkout. `fixtures` is
  // already here for the copy at the top level; this is the copy one level down.
  //
  // `.tmp` is this repo's scratch space — throwaway builds, patches, probe configs
  // and byte baselines a verification run parks there and deletes. `.gitignore` has
  // always held it and this list had not, so a scratch file parked there turns
  // `npm run lint` red about code nobody wrote. Ignored by version control is not
  // ignored by lint until it is written here too.
  globalIgnores([
    'dist',
    'coverage',
    'docs',
    'examples',
    'fixtures',
    '.stryker-tmp',
    'reports',
    '.claude/worktrees',
    '.tmp',
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
  // The `.mjs` half of the repo — `blueprint.config.mjs`, which drives every
  // gate here, and the `scripts/*.mjs` that run them. Same split, different
  // language: plain ESM JavaScript, so the default parser (espree) is the right
  // one and `tseslint.configs.recommended` is deliberately not extended — it
  // would install the TypeScript parser over files that have no types, and its
  // rules have no node to fire on. `js.configs.recommended` is the half that
  // does apply, and it is the same half the `.ts` entry above already takes.
  //
  // `ecmaVersion` is 2022 rather than the 2020 above because 2020 cannot parse
  // these files: `scripts/dist-verify.mjs:82` awaits at the top level.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  // The house rules, scoped to what the emitted config does not reach, so
  // exactly one entry owns any file's formatting. blueprint's globs are
  // `{sourceRoot}/{layer}/**`, which is what `layerGlobs` above holds.
  //
  // What stays outside: the root wiring files (`eslint.config.ts`,
  // `rolldown.config.ts`, `vitest.config.ts`) and every `.mjs` — the config
  // itself and `scripts/`. No layer glob can reach the `.mjs`: the emitted globs
  // start at `sourceRoot` and carry the framework's own extension set, which has
  // no `.mjs` in it. Being outside the layer nets is what puts them here, and
  // this entry is what keeps them governed by something.
  {
    files: ['**/*.ts', '**/*.mjs'],
    ignores: layerGlobs,
    plugins: {
      '@stylistic': stylistic,
      'import-x': imports,
    },
    rules: {
      ...formatting.rules,
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
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
  // The two house rules that cannot be written once for both languages. Same
  // scope as the entry above, split only by which rule id exists where.
  //
  // `no-explicit-any` has no `.mjs` counterpart at all — `any` is a type
  // annotation, espree cannot parse one, and the rule's own plugin is loaded
  // only for `.ts`. It is the one house rule that does not cross, and the reason
  // is that there is no file it could fire on, not that `.mjs` was let off.
  {
    files: ['**/*.ts'],
    ignores: layerGlobs,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', unusedVars],
    },
  },
  // `.mjs` deliberately does NOT get `unusedVars` — `js.configs.recommended`
  // runs `no-unused-vars` there at error tier with no ignore patterns, and that
  // is the stricter of the two. Restating the house options would be a rule
  // relaxed with nothing red behind it: measured, no `.mjs` in this repo needs
  // the `_` escape. The consistency argument ("a discard should mean the same
  // thing on both sides") is real and is not worth a pre-emptive loosening; the
  // moment a `.mjs` genuinely needs a discarded binding is the moment to decide,
  // and its red is what will say so.
  //
  // Last in the array, so the emitted entries win wherever they and the house
  // rules both match. `validateBlueprint` is what the skipped `defineBlueprint`
  // was doing — the config is a plain literal, and this is where it is checked.
  ...emitLint(validateBlueprint(blueprint), {
    typescript: tseslint.plugin,
    stylistic,
    imports,
  }),
]);
