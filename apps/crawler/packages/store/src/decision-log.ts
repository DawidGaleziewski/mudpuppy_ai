import type { Logger } from 'pino';
import {
  DecisionKind,
  DecisionLogEntry,
  maskText,
  newId,
  nowIso,
  scrubJson,
} from '@pathfinder/core';
import type { PathfinderDb } from './db.js';
import { emitForRun, type Tracer } from './tracer.js';

export interface DecisionInput {
  run_id: string;
  kind: DecisionKind;
  /** Rule or cap that applied (denylist id, scope rule, `budget:max_steps`, fingerprint threshold...). */
  rule?: string | null;
  reason: string;
  /** State/edge/frontier/action id concerned. */
  subject_ref?: string | null;
  detail?: unknown;
}

export interface DecisionLog {
  /** Persist the entry (the record, FR-021) and mirror it to the logger. Returns the stored entry. */
  record(input: DecisionInput): Promise<DecisionLogEntry>;
}

/** Decision-log writer: `decision_log` table is authoritative; pino mirrors each entry (T014 decision). */
export function createDecisionLog(db: PathfinderDb, logger: Logger): DecisionLog {
  return {
    async record(input) {
      const detail = input.detail === undefined ? null : scrubJson(input.detail);
      const entry = DecisionLogEntry.parse({
        id: newId(),
        run_id: input.run_id,
        kind: input.kind,
        rule: input.rule ?? null,
        reason: maskText(input.reason),
        subject_ref: input.subject_ref ?? null,
        detail_json: detail,
        created_at: nowIso(),
      });
      await db
        .insertInto('decision_log')
        .values({ ...entry, detail_json: detail === null ? null : JSON.stringify(detail) })
        .execute();
      logger.info({ decision: entry.kind, ...entry }, `decision:${entry.kind}`);
      return entry;
    },
  };
}

/**
 * Link every recorded decision to the trace (research §2): an `event decision` under the current
 * span, or, from a Playwright callback outside any call, under the run's open browser call. The
 * entry and the `decision_log` row are unchanged.
 */
export function linkDecisions(decisions: DecisionLog, tracer: Tracer): DecisionLog {
  return {
    async record(input) {
      const entry = await decisions.record(input);
      const attrs = { decision_id: entry.id, kind: entry.kind, rule: entry.rule };
      const opts = { decisionId: entry.id, summary: `${entry.kind}: ${entry.reason}` };
      emitForRun(tracer, entry.run_id, 'decision', attrs, opts);
      return entry;
    },
  };
}
