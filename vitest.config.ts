import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The committed showcase configs `import '@kekkai/blueprint'`; in tests
    // (which run against source, before any build) resolve that to src so the
    // showcase drift guard can load the real configs without a built dist.
    alias: {
      '@kekkai/blueprint': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
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
