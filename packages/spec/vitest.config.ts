import { defineConfig } from 'vitest/config';

// Coverage thresholds per TESTING.md §7: >= 90% on core packages, and 100% on
// validation- and value-critical paths (decimal/rounding, validators,
// cross-field constraints). Gates may rise but never silently fall.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Generated code and bare interface/type declarations carry no executable
      // logic to cover.
      exclude: ['src/generated/**', 'src/ports/**', 'src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
        // Value- and validation-critical paths must be fully covered.
        'src/decimal.ts': {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        'src/validation/**': {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
