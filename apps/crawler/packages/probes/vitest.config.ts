import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'probes',
    include: ['tests/**/*.test.ts'],
  },
});
