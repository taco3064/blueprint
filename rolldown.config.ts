import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'index.js',
    },
  },
  {
    input: 'src/cli/cli.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'bin.js',
    },
    external: ['node:fs', 'node:path', 'node:url', 'node:child_process'],
  },
]);
