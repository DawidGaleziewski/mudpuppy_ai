import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'fix-plugins',
    include: ['tests/**/*.test.ts'],
  },
});
