/**
 * Goal score of a trace task: how many of the ground-truth process's steps the crawler reached, in
 * order, and whether it reported the goal reached. Only for tasks with a `trace` (tasks.ts).
 */
import type { GroundTruth } from '@pathfinder/docs';
import { traceOutcome, traceStepRoutes, type RawDb } from '../../queries.js';

export interface StepsScore {
  matched: number;
  total: number;
  pct: number;
  /** Ground-truth steps not reached in order. */
  missing: string[];
}

/** A route without its query: the query is not part of the screen (as in crawl coverage). */
const routeOnly = (route: string) => route.replace(/\?.*$/, '');

/**
 * Expected steps found in `seen` in the same order (a subsequence; other pages in between are
 * fine). A step reached out of order does not count.
 */
export function stepsInOrder(expected: readonly string[], seen: readonly string[]): StepsScore {
  const routes = seen.map(routeOnly);
  let from = 0;
  const missing: string[] = [];
  for (const step of expected) {
    const at = routes.indexOf(routeOnly(step), from);
    if (at === -1) missing.push(step);
    else from = at + 1;
  }
  const matched = expected.length - missing.length;
  const pct = expected.length === 0 ? 0 : Math.round((matched / expected.length) * 1000) / 10;
  return { matched, total: expected.length, pct, missing };
}

export function scoreTrace(db: RawDb, runId: string, groundTruth: GroundTruth, processId: string) {
  const process = groundTruth.processes.find((p) => p.id === processId);
  if (!process?.steps) throw new Error(`ground truth has no steps for process ${processId}`);
  return {
    steps: stepsInOrder(process.steps, traceStepRoutes(db, runId)),
    goalReached: traceOutcome(db, runId) === 'goal_reached',
  };
}
