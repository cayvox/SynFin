import { defineConfig } from 'vitest/config';

// The CLI's logic (aggregation + formatting) is pure and tested to >= 90%
// (TESTING.md §7). The bin entry `main.ts` is the thin I/O shell (argv parsing,
// live fetchers, env, console, process exit, fixture fallback wiring) and is
// excluded from coverage — it is exercised by the documented manual demo run.
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
