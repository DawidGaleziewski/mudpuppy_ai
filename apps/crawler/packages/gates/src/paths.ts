import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Repo root (this file is apps/crawler/packages/gates/src/paths.ts). */
export const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const PROVING_GROUND = join(REPO, 'apps', 'proving-ground');
export const CATALOGUE = join(REPO, 'docs', 'legacy-obstacles.md');
export const EVAL_CASES = fileURLToPath(new URL('../eval-cases.yaml', import.meta.url));
export const GATE_TESTS = fileURLToPath(new URL('../tests', import.meta.url));
export const MIGRATIONS = join(REPO, 'data', 'migrations');
/** Raw per-case results of the current run; aggregated into data/gates/report.json. */
export const RESULTS_FILE = join(REPO, 'data', 'gates', '.results.jsonl');
export const REPORT_FILE = join(REPO, 'data', 'gates', 'report.json');

/** Gate ports: never the developer's 4100/4101 estate (plan.md Constraints). */
export const GATE_PORT = 4200;
export const GATE_WIDGET_PORT = 4201;
export const GATE_BASE = `http://127.0.0.1:${GATE_PORT}`;
/** Fixture users (hashes of `test-password-not-real`); never the developer's generated users. */
export const FIXTURE_USERS = join(PROVING_GROUND, 'backend', 'tests', 'fixtures', 'users.json');
export const FIXTURE_PASSWORD = 'test-password-not-real';
/** Session idle timeout the gate estate runs with (LO-32 cases wait it out). */
// Long enough for a step on a page whose stabilizer runs to its timeout (SSE never idles).
export const GATE_SESSION_TIMEOUT_S = 20;
