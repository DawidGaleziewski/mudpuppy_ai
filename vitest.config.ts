import { defineConfig } from 'vitest/config';

// `vitest.workspace` files were removed in Vitest 4; monorepo projects live in `test.projects`.
export default defineConfig({
  test: {
    projects: ['packages/*'],
    passWithNoTests: true,
  },
});
