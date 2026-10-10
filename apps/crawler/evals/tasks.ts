/**
 * The eval suite: one task per portal the eval can grade, where its ground truth lives and how
 * to start its local server. The ground truth stays next to the portal it describes (its
 * self-check tests read it there); this list is the one place that names them all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GroundTruth } from '@pathfinder/docs';

export interface PortalServer {
  /** A URL that answers 2xx once the server is up. */
  probe: string;
  command: string;
  args: (root: string, sessionTimeoutS: number | undefined) => string[];
  /** Whether `--session-timeout` can be passed to it (the proving-ground estate only). */
  takesSessionTimeout: boolean;
}

export interface EvalTask {
  portal: string;
  /** Repo-relative path of the ground-truth JSON. */
  groundTruth: string;
  server: PortalServer;
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
  groundTruth: `apps/proving-ground/ground-truth/${domain}.json`,
  server: PROVING_GROUND_ESTATE,
});

export const SUITE: readonly EvalTask[] = [
  {
    portal: 'reference-insurer',
    groundTruth: 'apps/crawler/packages/reference-portal/ground-truth.json',
    server: REFERENCE_PORTAL,
  },
  provingGround('shop'),
  provingGround('bank'),
  provingGround('insurer'),
];

export function taskFor(portal: string): EvalTask | undefined {
  return SUITE.find((t) => t.portal === portal);
}

export function loadGroundTruth(root: string, task: EvalTask): GroundTruth {
  return GroundTruth.parse(JSON.parse(readFileSync(join(root, task.groundTruth), 'utf8')));
}
