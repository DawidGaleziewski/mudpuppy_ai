import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'wireframe',
    include: ['tests/**/*.test.ts'],
  },
});
