// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const APP = ['**/app/**', '**/pages/**', '**/features/**'];

/** What each design-system layer may not import (the layers above it, and the app). */
const LAYERS = {
  atoms: ['**/molecules/**', '**/organisms/**', '**/layout/**', ...APP],
  layout: ['**/molecules/**', '**/organisms/**', ...APP],
  molecules: ['**/organisms/**', ...APP],
  organisms: APP,
};

function layerRules() {
  const blocks = Object.entries(LAYERS).map(([layer, group]) => ({
    files: [`src/design-system/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group, message: `A ${layer.replace(/s$/, '')} imports only from its own layer and the ones below it (atomic design).` }] }],
    },
  }));
  return [
    ...blocks,
    {
      files: ['src/pages/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: [{ group: ['**/design-system/*/**', '!**/design-system/index*'], message: 'Import the design system from its index (design-system), not a component file.' }] },
        ],
      },
    },
  ];
}

// The typed rules of apps/chat and apps/crawler (G-21, G-22), plus React's hooks rules.
export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', 'storybook-static/', 'src/design-system/assets/', 'public/vendor/']),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'stylelint.config.mjs', 'scripts/*.mjs', '.storybook/*.ts', '.storybook/*.tsx'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      'no-nested-ternary': 'error',
      // Design system (skill mudpuppy-react-ui): no colours, fonts or sizes written by hand.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style'] Property[key.name=/^(color|background|fontFamily|fontSize|borderRadius|boxShadow)$/]",
          message: 'Use a design-system component or a token, not an inline colour, font, radius or shadow.',
        },
      ],
    },
  },
  {
    files: ['**/*.stories.tsx'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Skill mudpuppy-react-ui rule 1: pages compose design-system components, they never style.
    files: ['src/pages/**/*.tsx', 'src/app/**/*.tsx', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className']",
          message: 'Pages never style: compose a design-system component (add one if it is missing).',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Pages never style: compose a design-system component (add one if it is missing).',
        },
        {
          // R-100: a raw anchor reloads the whole app; links go through the design system's Anchor.
          selector: "JSXOpeningElement[name.name='a']",
          message: 'No raw <a>: use a design-system link (Text, Tag, LinkButton, Anchor) so the router moves.',
        },
      ],
    },
  },
  // Atomic layers (skill frontend-architecture § 1, spec 076): imports go one way, atoms → molecules
  // → organisms → templates → pages; layout sits beside the atoms. The design system never imports
  // the app, and the app reaches the design system through its index only.
  ...layerRules(),
  {
    // The one place a plain anchor is drawn: files, downloads and other sites.
    files: ['src/app/RouterAnchor.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
