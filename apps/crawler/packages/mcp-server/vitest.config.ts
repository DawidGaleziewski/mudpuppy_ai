import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'mcp-server',
    include: ['tests/**/*.test.ts'],
    // Most tests here drive a real browser; new states also take a screenshot (spec 008), so the
    // 5 s default is too tight under full-suite load (findings F-04).
    testTimeout: 30_000,
  },
});
