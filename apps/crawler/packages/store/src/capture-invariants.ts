/**
 * The M1 capture gate (spec 039 plan § 1, T023): what every scan must have recorded for the model
 * to rebuild from it. Each list names the rows that break a rule; all empty means the gate holds.
 * - every observation has a build (or one flagged `unknown`);
 * - every journey's transitions are numbered 1..n without a gap, and every executed transition of
 *   a scan belongs to a journey;
 * - every fill or select a scan typed has its attribute write at the same step;
 * - every trace step that pressed or typed cites the transition it documents.
 */
import type BetterSqlite3 from 'better-sqlite3';

type Raw = BetterSqlite3.Database;

export interface CaptureViolations {
  observationsWithoutBuild: string[];
  transitionsWithoutJourney: string[];
  journeysWithGaps: string[];
  fillsWithoutWrite: string[];
  traceStepsWithoutTransition: string[];
}

const ids = (raw: Raw, sql: string, portal: string): string[] =>
  (raw.prepare(sql).all(portal) as { id: string }[]).map((r) => r.id);

export function captureInvariants(raw: Raw, portal: string): CaptureViolations {
  return {
    observationsWithoutBuild: ids(
      raw,
      `SELECT o.id FROM observations o JOIN runs r ON r.id = o.run_id
       WHERE r.portal_id = ? AND NOT EXISTS (SELECT 1 FROM observation_builds b WHERE b.observation_id = o.id)
       ORDER BY o.id`,
      portal,
    ),
    transitionsWithoutJourney: ids(
      raw,
      `SELECT t.id FROM transitions t JOIN runs r ON r.id = t.run_id
       WHERE r.portal_id = ? AND t.status = 'executed' AND t.journey_id IS NULL ORDER BY t.id`,
      portal,
    ),
    journeysWithGaps: ids(
      raw,
      `SELECT j.id FROM journeys j JOIN runs r ON r.id = j.run_id
       WHERE r.portal_id = ? AND (SELECT count(*) FROM transitions t WHERE t.journey_id = j.id)
         <> coalesce((SELECT max(t.seq) FROM transitions t WHERE t.journey_id = j.id), 0)
       ORDER BY j.id`,
      portal,
    ),
    fillsWithoutWrite: ids(
      raw,
      `SELECT t.id FROM transitions t JOIN runs r ON r.id = t.run_id
       WHERE r.portal_id = ? AND t.status = 'executed' AND t.kind IN ('fill', 'select')
         AND NOT EXISTS (SELECT 1 FROM attribute_writes w
           WHERE w.journey_id = t.journey_id AND w.seq = t.seq AND w.source = 'input')
       ORDER BY t.id`,
      portal,
    ),
    traceStepsWithoutTransition: ids(
      raw,
      `SELECT s.id FROM process_steps s JOIN processes p ON p.id = s.process_id
       WHERE p.portal_id = ? AND s.kind <> 'navigate' AND s.action_id IS NOT NULL
         AND s.transition_id IS NULL ORDER BY s.id`,
      portal,
    ),
  };
}
