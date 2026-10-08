import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'chat-model',
    include: ['tests/**/*.test.ts'],
  },
});
