// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/']),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // G-21: every async call is awaited, returned or voided with a reason.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // G-22: typed `no-unsafe-*` rules start as warnings (most hits are JSON.parse and
      // Playwright `evaluate` results); they become errors once the baseline is worked down.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      // 72 hits, nearly all async functions that implement an async interface without awaiting;
      // no bug signal, so counted in the lint baseline instead of failing.
      '@typescript-eslint/require-await': 'warn',
      // 15 hits, all `String(value ?? '')` on `unknown` JSON content (`unknown ?? ''` is typed
      // `{}`): deliberate coercions, so counted in the baseline instead of failing.
      '@typescript-eslint/no-base-to-string': 'warn',
      // G-01..G-04 size and shape, warnings with a baseline (`pnpm lint:report`).
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      'max-params': ['warn', 5],
      'max-depth': ['warn', 4],
      // Nested ternaries hide branching; use a lookup table, early returns or a switch. 29 hits
      // when added (R-46), so a warning with a baseline, like the size rules above.
      'no-nested-ternary': 'warn',
    },
  },
  {
    files: ['**/tests/**'],
    rules: {
      'max-lines-per-function': 'off', // G-02: tests are exempt
      // `expect(mock.method)` and deliberately built `new Function` bug reproductions.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },
  {
    // G-12: the browser runtime is reached through its index only, never its internals (unit
    // tests of a runtime module may import it directly).
    files: ['packages/mcp-server/src/**/*.ts'],
    ignores: ['packages/mcp-server/src/runtime/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)runtime/(?!index\\.js$).+',
              message: 'G-12: import the runtime through runtime/index.js only.',
            },
          ],
        },
      ],
    },
  },
  {
    // G-18: pipeline steps return their decisions and events; `step()` in context.ts writes them.
    // stop.ts is the run lifecycle (persistStop also runs outside any step).
    files: ['packages/mcp-server/src/runtime/pipeline/**/*.ts'],
    ignores: [
      'packages/mcp-server/src/runtime/pipeline/context.ts',
      'packages/mcp-server/src/runtime/pipeline/stop.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='decisions']",
          message: 'G-18: return decision(...) from the step instead of writing the decision log.',
        },
        {
          selector: "MemberExpression[object.property.name='tracer'][property.name=/^event/]",
          message: 'G-18: return event(...) from the step instead of writing the trace.',
        },
      ],
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
);
