import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'crawler',
    include: ['tests/**/*.test.ts'],
  },
});
