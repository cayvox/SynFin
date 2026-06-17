import { defineConfig } from 'vitest/config';

// Core package: >= 90% coverage (TESTING.md §7).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
