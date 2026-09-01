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
    // Third of the same family, and the only one about time rather than about
    // which files run. Cold — a fresh `npm ci`, nothing in the transform cache —
    // seven tests here cost more than vitest's 5000ms default, six of them under
    // 3000ms warm; the worst is `conformance.inspect.test.ts`'s real-eslint
    // TypeScript chain, 27.7s cold against 6.0s warm, being the first test to
    // pull typescript-eslint's type-aware chain off a node_modules nothing has
    // read yet. Of `ci.yml`'s two jobs that run `test`, only the matrix one
    // arrives warm: `lint` and `tsc` go ahead of `test` there and pull those very
    // modules — measured, the same cold tree is green at 5000ms in that order.
    // `eslint-10` runs `npm ci` into `npm test` with only an eslint swap between
    // them, which reads none of that chain, and it has never been timed; a local
    // `npm ci && npm test` is the same cold shape. So the default reports the
    // machine, not the code; and so would any replacement read off a warm run,
    // which is why 60000 is anchored to the cold figure — ~2x that slowest case,
    // ~6x the band under it, margin for a slower runner rather than spare room.
    // Not a runaway guard: a synchronous loop never yields, so no value fires on
    // one and the worker goes down instead (`filter.test.ts` says why).
    testTimeout: 60000,
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
