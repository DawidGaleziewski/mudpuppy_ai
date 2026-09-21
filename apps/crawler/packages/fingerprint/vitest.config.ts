import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'fingerprint',
    include: ['tests/**/*.test.ts'],
  },
});
