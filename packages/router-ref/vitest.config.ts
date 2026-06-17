import { defineConfig } from 'vitest/config';

// Core package: >= 90% coverage (TESTING.md §7). A couple of defensive guards
// (malformed-input fall-throughs that validated inputs cannot reach) keep this
// below 100% by design; the value-critical decimal/validation paths are held at
// 100% in @synfin/spec.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
  },
});
