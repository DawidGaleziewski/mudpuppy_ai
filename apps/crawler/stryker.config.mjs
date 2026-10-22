// @ts-check
/* global process -- read by Stryker under Node */
/**
 * Mutation testing of one crawler package (spec 012 US6, guideline G-32). Run through
 * `pnpm mutate [--package <name>]` (scripts/mutate.ts), which sets MUDPUPPY_MUTATE_PACKAGE.
 * Reports go to data/mutation/stryker/<package>/ (gitignored); never part of commit or merge checks.
 */
const pkg = process.env.MUDPUPPY_MUTATE_PACKAGE ?? 'fingerprint';
const out = `../../data/mutation/stryker/${pkg}`;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // The vitest runner (10.0) records coverage on Vitest 5 but never activates a mutant (an
  // `ids.ts` mutant that empties `newId`'s clock update "survived" its covering tests), so the
  // command runner runs the package's tests once per mutant instead (research R12, findings F-11).
  testRunner: 'command',
  commandRunner: { command: `pnpm exec vitest run --project ${pkg} --reporter=dot` },
  coverageAnalysis: 'off',
  mutate: [`packages/${pkg}/src/**/*.ts`, `!packages/${pkg}/src/**/index.ts`],
  // Without `checkers: ['typescript']`: type-invalid mutants just fail the tests (faster to set up).
  // Not incremental: the command runner tells Stryker nothing about which tests ran, so an
  // incremental run replays the old result of every unchanged mutant even after new tests were
  // added (findings F-15).
  incremental: false,
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: `${out}/report.html` },
  jsonReporter: { fileName: `${out}/report.json` },
  // In place, not in a sandbox copy: tests import workspace packages and read repo files
  // (`portals/`, `data/migrations/`) that a copy of apps/crawler does not reach, so in a sandbox
  // they ran against the unmutated sources (findings F-11). Stryker restores every file when it
  // ends; do not edit the package while it runs.
  inPlace: true,
  tempDirName: '../../data/mutation/.stryker-tmp',
  concurrency: 4,
  timeoutMS: 20_000,
};
