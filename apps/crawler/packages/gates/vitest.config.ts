import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gates',
    include: ['tests/**/*.test.ts'],
    // Pure eval checks need no estate: they run in the root `repo` project, in the fast tier
    // (spec 014 F-03).
    exclude: ['tests/eval-*.test.ts'],
    // One shared estate (fixed ports, shared test users and lockout counters): files run one by one.
    fileParallelism: false,
    globalSetup: ['./src/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
