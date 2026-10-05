import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'vault',
    include: ['tests/**/*.test.ts'],
  },
});
