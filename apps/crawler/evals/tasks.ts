/**
 * The eval suite: one task per portal the eval can grade, where its ground truth lives and how
 * to start its local server. The ground truth of a portal we own stays next to it (its self-check
 * tests read it there); one we don't own (a live site) lives in `evals/ground-truth/`. This list is
 * the one place that names them all.
 */
import { join } from 'node:path';
import { readGroundTruth, type GroundTruth } from '@pathfinder/docs';

export interface PortalServer {
  /** A URL that answers 2xx once the server is up. */
  probe: string;
  command: string;
  args: (root: string, sessionTimeoutS: number | undefined) => string[];
  /** Whether `--session-timeout` can be passed to it (the proving-ground estate only). */
  takesSessionTimeout: boolean;
}

/** A trace task: the crawler walks one named process instead of mapping the portal. */
export interface TraceSpec {
  /** The ground-truth process the trace is graded against. */
  processId: string;
  name: string;
  /** Said to the crawler as the trace goal. */
  goal: string;
}

export interface EvalTask {
  portal: string;
  /** Repo-relative path of the ground-truth YAML (G-34). */
  groundTruth: string;
  /** How to start the portal locally; absent for a live site. */
  server?: PortalServer;
  /** Absent: the crawler maps the portal (map mode). */
  trace?: TraceSpec;
}

const REFERENCE_PORTAL: PortalServer = {
  probe: 'http://127.0.0.1:4010/robots.txt',
  command: 'pnpm',
  args: (root) => ['--dir', join(root, 'apps/crawler'), 'reference-portal'],
  takesSessionTimeout: false,
};

/** One server hosts all three proving-ground portals. */
const PROVING_GROUND_ESTATE: PortalServer = {
  probe: 'http://127.0.0.1:4100/healthz',
  command: 'node',
  args: (root, sessionTimeoutS) => [
    join(root, 'apps/proving-ground/scripts/start.mjs'),
    ...(sessionTimeoutS === undefined ? [] : ['--session-timeout', String(sessionTimeoutS)]),
  ],
  takesSessionTimeout: true,
};

const provingGround = (domain: 'shop' | 'bank' | 'insurer'): EvalTask => ({
  portal: `proving-ground-${domain}`,
  groundTruth: `apps/proving-ground/ground-truth/${domain}.yaml`,
  server: PROVING_GROUND_ESTATE,
});

export const SUITE: readonly EvalTask[] = [
  {
    portal: 'reference-insurer',
    groundTruth: 'apps/crawler/packages/reference-portal/ground-truth.yaml',
    server: REFERENCE_PORTAL,
  },
  provingGround('shop'),
  provingGround('bank'),
  provingGround('insurer'),
  // Live production site, owner's learning task (R-46): read-only, crawler only, one trace.
  {
    portal: 'wikipedia',
    groundTruth: 'apps/crawler/evals/ground-truth/wikipedia.yaml',
    trace: {
      processId: 'P01',
      name: 'Find the article about pickled cucumbers',
      goal: 'Search for "pickle" on the home page and open the article about pickled cucumbers (the food).',
    },
  },
];

export function taskFor(portal: string): EvalTask | undefined {
  return SUITE.find((t) => t.portal === portal);
}

export function loadGroundTruth(root: string, task: EvalTask): GroundTruth {
  return readGroundTruth(join(root, task.groundTruth));
}
