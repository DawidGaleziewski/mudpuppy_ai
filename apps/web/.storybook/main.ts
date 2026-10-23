import type { StorybookConfig } from '@storybook/react-vite';

// The design system's catalogue (R-96, owner 2026-10-22: "I want components in storybook also so
// I can see them. Document each component"). `pnpm --dir apps/web storybook` → http://localhost:6006.
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
