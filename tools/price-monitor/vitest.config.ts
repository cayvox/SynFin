import { defineConfig } from 'vitest/config';

// The monitor's logic (collection, spread, report, store I/O) is pure or
// fixture-driven and tested to >= 90% (TESTING.md §7). The bin entry `main.ts`
// is the thin I/O shell (argv, live fetchers, env, filesystem writes, console)
// and is excluded from coverage — exercised by the documented manual live run.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/main.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
