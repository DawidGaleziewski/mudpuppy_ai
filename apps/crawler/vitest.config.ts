import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

const app = import.meta.dirname;
const repo = resolve(app, '../..');

/**
 * Files the module graph cannot see (test harnesses, fixtures, schema, portal/persona configs,
 * tool configs): a change to one runs the whole fast tier (spec 012, contracts/test-commands.md).
 * `--changed` matches these against absolute paths of the whole repo, so they are absolute.
 */
export const forceRerunTriggers = [
  ...configDefaults.forceRerunTriggers,
  ...[
    'tests/**/harness.ts',
    'tests/**/*-harness.ts',
    'tests/**/mock-*.ts',
    'tests/**/helpers.ts',
    'tests/**/shared-pages.ts',
    'tests/**/fixtures/**',
  ].flatMap((glob) => [resolve(app, glob), resolve(app, 'packages/*', glob)]),
  resolve(repo, 'data/migrations/**'),
  resolve(repo, 'portals/**'),
  resolve(repo, 'personas/**'),
  resolve(app, '**/tsconfig*.json'),
  resolve(app, 'eslint.config.mjs'),
  resolve(app, 'layers.json'),
];

// `vitest.workspace` files were removed in Vitest 4; monorepo projects live in `test.projects`.
export default defineConfig({
  test: {
    // `repo`: checks over the whole workspace (package layers), the eval runner's own unit tests
    // and the gates' pure eval checks (no estate, spec 014 F-03), in the fast tier.
    projects: [
      'packages/*',
      {
        test: {
          name: 'repo',
          include: [
            'tests/**/*.test.ts',
            'evals/tests/**/*.test.ts',
            'packages/gates/tests/eval-*.test.ts',
          ],
        },
      },
    ],
    passWithNoTests: true,
    forceRerunTriggers,
  },
});
