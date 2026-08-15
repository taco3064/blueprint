import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Stryker stages a mutated copy of the whole tree under .stryker-tmp. A
    // sandbox left behind by an interrupted run is collected from here
    // otherwise, so `npm test` executes a stale copy of every test file beside
    // the real one — and Stryker's own runs score against those copies, whose
    // failures it reads as mutants killed.
    // `.claude/worktrees` is the same hazard as `.stryker-tmp` from a different
    // direction: a git worktree checked out inside the repo carries a second copy of
    // every test file, so `npm test` ran 6556 tests across three checkouts and went red
    // on a sibling session's work in progress. A worktree is for isolating that work;
    // collecting its suite here is the opposite of isolating it.
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**', '.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      // `test/` is in the denominator on purpose. Moving the conformance DSL out of
      // `src/` was a placement decision, not a decision about what 100% covers — and
      // an `include` that only names `src` would have quietly dropped
      // `test/conformance/conformance.ts` from the measurement while every figure
      // still read 100%.
      include: ['src/**/*.ts', 'test/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
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
