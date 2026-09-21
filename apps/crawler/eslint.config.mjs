// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
);
