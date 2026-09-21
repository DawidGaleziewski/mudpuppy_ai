import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'mcp-server',
    include: ['tests/**/*.test.ts'],
  },
});
