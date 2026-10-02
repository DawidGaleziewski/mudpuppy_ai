import {
  AnalysisPass,
  newId,
  nowIso,
  type AnalysisSessionPassEntry,
  type AnalysisSessionStatus,
} from '@pathfinder/core';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import {
  assertNoPii,
  inTransaction,
  json,
  requireActiveSession,
  sessionRunIds,
  type SessionRow,
} from './common.js';
import { feedbackSummary, pendingFeedback } from './feedback.js';

/** A `running` session with no write for this long is taken to be abandoned (data-model.md). */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

export const StartSessionInput = z
  .object({
    portal_id: z.string().min(1),
    run_ids: z.array(z.string().min(1)).min(1),
    resume_session_id: z.string().min(1).optional(),
  })
  .strict();

export const RecordPassInput = z
  .object({
    session_id: z.string().min(1),
    pass: AnalysisPass,
    summary: z.string().trim().min(1).max(2000),
  })
  .strict();

export const FinishSessionInput = z
  .object({
    session_id: z.string().min(1),
    summary: z.string().trim().min(1).max(4000),
    gaps: z.array(z.string().trim().min(1).max(1000)),
  })
  .strict();

export interface SessionOutput {
  session_id: string;
  portal_id: string;
  status: AnalysisSessionStatus;
  run_ids: string[];
  /** Passes already recorded (non-empty only on resume). */
  passes: AnalysisPass[];
  resumed: boolean;
  pending_feedback: Record<string, number>;
}

/** Every run must exist and belong to the portal the session documents. */
function assertRunsOfPortal(ctx: BaContext, portalId: string, runIds: readonly string[]): void {
  const find = ctx.raw.prepare('SELECT portal_id FROM runs WHERE id = ?');
  for (const runId of runIds) {
    const run = find.get(runId) as { portal_id: string } | undefined;
    if (!run)
      throw new ToolError('RUN_NOT_FOUND', `run ${runId} does not exist`, { run_id: runId });
    if (run.portal_id !== portalId)
      throw new ToolError(
        'PORTAL_MISMATCH',
        `run ${runId} belongs to portal ${run.portal_id}, not ${portalId}`,
        { run_id: runId, portal_id: run.portal_id },
      );
  }
}

/** Create a session over the given runs, or resume an interrupted one (which may add runs). */
export function startSession(ctx: BaContext, raw: unknown): SessionOutput {
  const input = parseInput(StartSessionInput, raw);
  return inTransaction(ctx, () => {
    assertRunsOfPortal(ctx, input.portal_id, input.run_ids);
    const addRun = ctx.raw.prepare(
      'INSERT OR IGNORE INTO analysis_session_runs (session_id, run_id) VALUES (?, ?)',
    );

    let sessionId: string;
    let passes: AnalysisPass[] = [];
    if (input.resume_session_id !== undefined) {
      const session = ctx.raw
        .prepare('SELECT * FROM analysis_sessions WHERE id = ?')
        .get(input.resume_session_id) as SessionRow | undefined;
      if (!session)
        throw new ToolError(
          'SESSION_NOT_ACTIVE',
          `session ${input.resume_session_id} does not exist`,
          { session_id: input.resume_session_id },
        );
      if (session.portal_id !== input.portal_id)
        throw new ToolError(
          'PORTAL_MISMATCH',
          `session ${session.id} documents portal ${session.portal_id}, not ${input.portal_id}`,
          { session_id: session.id, portal_id: session.portal_id },
        );
      if (session.status === 'completed')
        throw new ToolError(
          'SESSION_NOT_ACTIVE',
          `session ${session.id} is completed and cannot be resumed; start a new session`,
          { session_id: session.id, status: session.status },
        );
      ctx.raw
        .prepare("UPDATE analysis_sessions SET status = 'running', ended_at = NULL WHERE id = ?")
        .run(session.id);
      sessionId = session.id;
      passes = json<AnalysisSessionPassEntry[]>(session.passes_json).map((p) => p.pass);
    } else {
      sessionId = newId();
      ctx.raw
        .prepare(
          `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
           VALUES (?, ?, 'running', '[]', NULL, '[]', ?, NULL)`,
        )
        .run(sessionId, input.portal_id, nowIso());
    }
    for (const runId of input.run_ids) addRun.run(sessionId, runId);

    return {
      session_id: sessionId,
      portal_id: input.portal_id,
      status: 'running',
      run_ids: sessionRunIds(ctx, sessionId),
      passes,
      resumed: input.resume_session_id !== undefined,
      pending_feedback: feedbackSummary(pendingFeedback(ctx, input.portal_id)),
    };
  });
}

/** Append one finished analysis pass to the session. A pass redone after a resume is appended again. */
export function recordPass(
  ctx: BaContext,
  raw: unknown,
): { session_id: string; passes: AnalysisPass[] } {
  const input = parseInput(RecordPassInput, raw);
  assertNoPii(input.summary, 'summary');
  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const passes = json<AnalysisSessionPassEntry[]>(session.passes_json);
    passes.push({ pass: input.pass, summary: input.summary, completed_at: nowIso() });
    ctx.raw
      .prepare('UPDATE analysis_sessions SET passes_json = ? WHERE id = ?')
      .run(JSON.stringify(passes), session.id);
    return { session_id: session.id, passes: passes.map((p) => p.pass) };
  });
}

/** Close the session. Refused until the `synthesis` pass was recorded: a session without it is unfinished work. */
export function finishSession(
  ctx: BaContext,
  raw: unknown,
): { session_id: string; status: 'completed'; passes: AnalysisPass[]; records_written: number } {
  const input = parseInput(FinishSessionInput, raw);
  assertNoPii(input.summary, 'summary');
  assertNoPii(input.gaps, 'gaps');
  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const passes = json<AnalysisSessionPassEntry[]>(session.passes_json).map((p) => p.pass);
    if (!passes.includes('synthesis'))
      throw new ToolError(
        'SESSION_INCOMPLETE',
        'finish_session needs the synthesis pass; record_pass it first (passes run in order: ' +
          `${AnalysisPass.options.join(', ')})`,
        { passes, missing: AnalysisPass.options.filter((p) => !passes.includes(p)) },
      );
    ctx.raw
      .prepare(
        "UPDATE analysis_sessions SET status = 'completed', summary = ?, gaps_json = ?, ended_at = ? WHERE id = ?",
      )
      .run(input.summary, JSON.stringify(input.gaps), nowIso(), session.id);
    const written = ctx.raw
      .prepare('SELECT COUNT(*) AS n FROM doc_revisions WHERE session_id = ?')
      .get(session.id) as { n: number };
    return {
      session_id: session.id,
      status: 'completed',
      passes,
      records_written: written.n,
    };
  });
}

/**
 * On server start: a session still `running` whose last write (start, pass or revision) is older than
 * 24 h lost its agent; mark it `interrupted` so it can be resumed. Returns the ids it changed.
 */
export function sweepStaleSessions(ctx: BaContext, now: Date = new Date()): string[] {
  const cutoff = new Date(now.getTime() - STALE_SESSION_MS).toISOString();
  return inTransaction(ctx, () => {
    const running = ctx.raw
      .prepare("SELECT * FROM analysis_sessions WHERE status = 'running'")
      .all() as SessionRow[];
    const lastRevision = ctx.raw.prepare(
      'SELECT MAX(created_at) AS at FROM doc_revisions WHERE session_id = ?',
    );
    const interrupt = ctx.raw.prepare(
      "UPDATE analysis_sessions SET status = 'interrupted', ended_at = ? WHERE id = ?",
    );
    const swept: string[] = [];
    for (const session of running) {
      const writes = [
        session.started_at,
        ...json<AnalysisSessionPassEntry[]>(session.passes_json).map((p) => p.completed_at),
        (lastRevision.get(session.id) as { at: string | null }).at,
      ].filter((t): t is string => t !== null);
      // ISO 8601 UTC strings of one format sort chronologically.
      const lastWrite = writes.reduce((a, b) => (a > b ? a : b));
      if (lastWrite < cutoff) {
        interrupt.run(now.toISOString(), session.id);
        swept.push(session.id);
      }
    }
    return swept;
  });
}
