/**
 * Goal score of the crawler: how many of the persona's ground-truth screens the run reached.
 */
import type { GroundTruth } from '@pathfinder/docs';
import { crawlScreens, frameRoutes } from '@pathfinder/gates';
import { compositions, observedRoutes, type RawDb } from '../../queries.js';

export function scoreCrawl(db: RawDb, runId: string, groundTruth: GroundTruth, loggedIn: boolean) {
  // Pages read inside frames count as reached under their own route (spec 015 F-13).
  const framed = frameRoutes(compositions(db, runId));
  return crawlScreens(groundTruth.screens, [...observedRoutes(db, runId), ...framed], loggedIn);
}
