import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'hooks',
    include: ['tests/**/*.test.ts'],
  },
});
