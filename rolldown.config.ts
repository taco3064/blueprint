import { defineConfig } from 'rolldown';

const external = [
  /^node:/,
  '@eslint-community/eslint-utils',
  '@typescript-eslint/parser',
  'vue-eslint-parser',
];

export default defineConfig([
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'index.js',
    },
    external,
  },
  {
    input: 'src/cli/cli.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'bin.js',
    },
    external,
  },
  {
    input: 'src/operational-contract/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'operational-contract/index.js',
    },
    external,
  },
]);
