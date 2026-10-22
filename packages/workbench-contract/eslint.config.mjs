// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Same typed rules as apps/crawler/eslint.config.mjs (spec 012 T017/T020, guidelines G-21, G-22).
export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/']),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // `vitest.config.ts` is outside tsconfig's `include` (src, tests).
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      'max-params': ['warn', 5],
      'max-depth': ['warn', 4],
      'no-nested-ternary': 'warn',
    },
  },
  {
    files: ['**/tests/**'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
);
