import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'workbench-contract',
    include: ['tests/**/*.test.ts'],
  },
});
