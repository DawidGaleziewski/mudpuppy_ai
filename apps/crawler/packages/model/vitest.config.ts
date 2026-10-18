import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'model',
    include: ['tests/**/*.test.ts'],
  },
});
