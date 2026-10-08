import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'docs-model',
    include: ['tests/**/*.test.ts'],
  },
});
