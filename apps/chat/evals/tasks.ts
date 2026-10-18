/**
 * The grouping suite as data (spec 038 FR-002): one task per portal whose processes a person wrote
 * down. The scans come from a finished crawler-eval trial (`--store`); the task names the ground
 * truth those scans are checked against.
 */
import { join } from 'node:path';
import { readGroundTruth } from '@pathfinder/docs';

export interface EvalTask {
  /** The portal id; the task's results go to `data/evals/grouping-<portal>/`. */
  portal: string;
  /** Ground truth (G-34), relative to the repo root. */
  groundTruth: string;
}

export const SUITE: readonly EvalTask[] = [
  {
    portal: 'reference-insurer',
    groundTruth: 'apps/crawler/packages/reference-portal/ground-truth.yaml',
  },
];

export function taskFor(portal: string): EvalTask | undefined {
  return SUITE.find((t) => t.portal === portal);
}

/** A ground-truth process as the grouping graders read it. */
export interface GtProcess {
  id: string;
  firstRoute: string;
  lastObservableRoute: string;
  /** The routes from the first to the last observable one, in order. */
  observable: string[];
  /** Every step, also those past what a guest scan can observe (a purchase's result page). */
  steps: string[];
}

/**
 * The task's processes, each cut at its last observable route: a guest scan never gets past a
 * purchase or a login wall, so a grouping is not asked to include what no scan could see.
 */
export function loadProcesses(root: string, task: EvalTask): GtProcess[] {
  return readGroundTruth(join(root, task.groundTruth)).processes.map((p) => {
    const steps = p.steps ?? [p.first_route];
    const end = steps.indexOf(p.last_observable_route);
    return {
      id: p.id,
      firstRoute: p.first_route,
      lastObservableRoute: p.last_observable_route,
      observable: end === -1 ? steps : steps.slice(0, end + 1),
      steps,
    };
  });
}
