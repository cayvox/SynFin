// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Generated code and build artifacts are not linted.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.astro/**',
      '**/*.generated.ts',
      'packages/*/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The ports use bare interface method signatures; allow `Promise`-returning
      // members without forcing `void` returns.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false },
      ],
    },
  },
  {
    // Config files and gen scripts run in Node and are not part of the typed program.
    files: ['**/*.config.{js,ts,mjs}', '**/scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Node globals for the same files (kept separate so it does not clobber the
    // parserOptions set by disableTypeChecked above).
    files: ['**/*.config.{js,ts,mjs}', '**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  // Astro website (apps/web): parse `.astro` with the Astro parser and apply the
  // plugin's recommended rules. Type-aware TS rules are disabled for `.astro`
  // (the frontmatter is not part of a tsconfig program); `.ts` islands under
  // apps/web are still fully type-checked by the global config above.
  ...astro.configs['flat/recommended'],
  {
    files: ['**/*.astro'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Ambient declaration files (e.g. Astro's env.d.ts) legitimately use
    // triple-slash references; that is their idiom.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },
  prettier,
);
