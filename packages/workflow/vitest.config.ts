import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'workflow',
    include: ['tests/**/*.test.ts'],
  },
});
