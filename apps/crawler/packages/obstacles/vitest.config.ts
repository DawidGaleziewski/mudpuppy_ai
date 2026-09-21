import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'obstacles',
    include: ['tests/**/*.test.ts'],
  },
});
