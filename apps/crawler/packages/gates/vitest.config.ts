import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gates',
    include: ['tests/**/*.test.ts'],
    // One shared estate (fixed ports, shared test users and lockout counters): files run one by one.
    fileParallelism: false,
    globalSetup: ['./src/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
