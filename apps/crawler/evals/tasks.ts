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
  /** Every port the server listens on: must be free before it starts and after it stops. */
  ports: readonly number[];
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
  /**
   * A map task's ground-truth processes the crawler also traces after the map, so the BA has
   * trace evidence for them (spec 025 FR-006). Guest persona only; `--no-process-traces` skips.
   */
  processTraces?: readonly TraceSpec[];
  /**
   * Routes whose recorded form steps are marked for probing after the map, then probed in one
   * probe scan (spec 034 phase 9: the export's Validation section). `--no-probe-scan` skips it.
   */
  probeForms?: readonly string[];
}

const REFERENCE_PORTAL: PortalServer = {
  probe: 'http://127.0.0.1:4010/robots.txt',
  command: 'pnpm',
  args: (root) => ['--dir', join(root, 'apps/crawler'), 'reference-portal'],
  takesSessionTimeout: false,
  ports: [4010],
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
  // The estate and its cross-origin widget host.
  ports: [4100, 4101],
};

/** Scar-maker (spec 030): the real-world scars, on 127.0.0.1/127.0.0.2:4300 and its proxy on 4302. */
const SCAR_MAKER: PortalServer = {
  probe: 'http://127.0.0.1:4300/healthz',
  command: 'pnpm',
  args: (root) => ['--dir', join(root, 'apps/scar-maker'), 'start'],
  takesSessionTimeout: false,
  ports: [4300, 4302],
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
    // P05 (renewal) is behind a login: a guest cannot trace it.
    processTraces: [
      {
        processId: 'P01',
        name: 'Oblicz składkę OC/AC',
        // Choosing AC records the options step's variant 4b (spec 034 phase 9); "Tylko OC" is
        // the map's happy path, so both variants are recorded.
        goal: 'Get a car insurance premium with "OC + Autocasco (AC)": fill every step of the calculator, choose "OC + Autocasco (AC)" and fill the vehicle value it asks for, and open the result with the premium.',
      },
      {
        processId: 'P02',
        name: 'Oblicz składkę podróżną',
        goal: 'Get a travel insurance premium and open its result.',
      },
      {
        processId: 'P03',
        name: 'Porównaj produkty',
        goal: 'Compare two insurance products and open the comparison.',
      },
      {
        processId: 'P04',
        name: 'Wyślij zapytanie kontaktowe',
        goal: 'Send a question through the contact form.',
      },
    ],
    // The OC/AC calculator (P01), whose export the owner approved (evals/reference-solutions/).
    probeForms: ['/kalkulator/pojazd', '/kalkulator/kierowca', '/kalkulator/opcje'],
  },
  provingGround('shop'),
  provingGround('bank'),
  provingGround('insurer'),
  // The scars (spec 030, owner: "tests and evals"): how much of the scarred portal a guest map
  // reaches; best run with --crawler-only (the ground truth holds screens only).
  {
    portal: 'scar-maker',
    groundTruth: 'apps/scar-maker/ground-truth.yaml',
    server: SCAR_MAKER,
  },
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

/** The process traces a trial of this task runs: the task's list, for the guest persona only. */
export function processTracesFor(task: EvalTask, persona: string, enabled: boolean): TraceSpec[] {
  return enabled && persona === 'guest' ? [...(task.processTraces ?? [])] : [];
}

/** The routes to probe after the map; none when `--no-probe-scan` is given. */
export function probeFormsFor(task: EvalTask, enabled: boolean): string[] {
  return enabled ? [...(task.probeForms ?? [])] : [];
}

export function loadGroundTruth(root: string, task: EvalTask): GroundTruth {
  return readGroundTruth(join(root, task.groundTruth));
}
