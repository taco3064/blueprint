import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Stryker stages a mutated copy of the whole tree under .stryker-tmp. A
    // sandbox left behind by an interrupted run is collected from here
    // otherwise, so `npm test` executes a stale copy of every test file beside
    // the real one — and Stryker's own runs score against those copies, whose
    // failures it reads as mutants killed.
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
