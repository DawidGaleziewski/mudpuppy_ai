import pino, { type DestinationStream, type Logger } from 'pino';
import type { PathfinderDb } from './db.js';
import { newId, nowIso } from './ids.js';
import { maskText, scrubJson } from './pii.js';
import { DecisionKind, DecisionLogEntry } from './schemas/decision-log.js';
import { emitForRun, type Tracer } from './trace/tracer.js';

/**
 * Structured JSON logger. The MCP server speaks stdio, so logs go to stderr (fd 2) by default,
 * never stdout.
 */
export function createLogger(
  opts: { level?: string; destination?: DestinationStream } = {},
): Logger {
  return pino(
    { level: opts.level ?? 'info', base: undefined },
    opts.destination ?? pino.destination(2),
  );
}

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
