import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'safety',
    include: ['tests/**/*.test.ts'],
  },
});
