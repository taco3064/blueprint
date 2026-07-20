import globals from 'globals';
import imports from 'eslint-plugin-import';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

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
  globalIgnores(['dist', 'coverage', 'docs', 'examples', 'fixtures', 'showcase']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    plugins: {
      '@stylistic': stylistic,
      import: imports,
    },
    rules: {
      ...formatting.rules,
      'import/first': 'error',
      'import/no-duplicates': 'error',
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
]);
