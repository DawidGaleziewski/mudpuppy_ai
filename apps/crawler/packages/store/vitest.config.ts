import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'store',
    include: ['tests/**/*.test.ts'],
  },
});
