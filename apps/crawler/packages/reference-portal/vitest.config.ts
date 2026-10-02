import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'reference-portal',
    include: ['tests/**/*.test.ts'],
  },
});
