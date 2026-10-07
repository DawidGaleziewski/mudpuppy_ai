import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'chat',
    include: ['tests/**/*.test.ts'],
  },
});
