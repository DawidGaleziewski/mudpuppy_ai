/**
 * The starting values of the portal model (spec 039 design § 6–14). Each is tuned per portal or by
 * the evals later; every module reads them from here, never from a literal of its own.
 */
export const MODEL_DEFAULTS = {
  /** Clustering algorithm id written on every model version. */
  algorithm: 'minhash-avglink-v1',
  /** Similarity at or above which two page versions are one screen until τ is calibrated. */
  tau: 0.9,
  /** Labels of each side (same / distinct) a portal needs before τ is calibrated. */
  labelsToCalibrate: 30,
  /** τ sweep for calibration. */
  tauSweep: { from: 0.5, to: 0.99, step: 0.01 },
  /** Labelling queue: pairs within this distance of τ. */
  labelWindow: 0.05,
  /** A route partition above this many states uses LSH banding for candidate pairs. */
  lshAbove: 500,
  lsh: { bands: 32, rows: 4 },
  /** Distinct values after which a path segment folds into `/:param` in the route template. */
  routeParamFold: 10,
  /** Share of screens an action's container must appear on to count as global navigation. */
  globalNavShare: 0.6,
  /** Consecutive runs that looked and missed an action before it is `not_seen_since`. */
  absentRunsForMissing: 2,
  /** Replays per run (R1, R4, R5), spent in planner priority order. */
  replayBudget: 20,
  /** Decision mining: rows per target before mining. */
  minRowsPerTarget: 5,
  /** Guard intersection: decision points chained along one path at most (T064). */
  guardPathDepth: 6,
  /** Stopping rule per process. */
  exploration: { depth: 2, randomWalks: 50, walkLength: 15 },
} as const;

export type ModelDefaults = typeof MODEL_DEFAULTS;
