// Write one workflow step row per (conversation, portal, step), validated by the core Zod schema.
// Used by the MCP tools (request accepted → pending) and by the step recorder (T022).

import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import {
  WorkflowStep,
  type WorkflowStepName,
  type WorkflowStepStatus,
} from '@mudpuppy/chat-model';

export interface StepChange {
  conversationId: string;
  portalId: string;
  step: WorkflowStepName;
  status: WorkflowStepStatus;
  runId?: string | null;
  sessionId?: string | null;
  errorRef?: string | null;
  now?: Date;
}

export function recordStep(raw: BetterSqlite3.Database, change: StepChange): WorkflowStep {
  const now = nowIso(change.now);
  const existing = raw
    .prepare(
      `SELECT * FROM workflow_steps WHERE conversation_id = ? AND portal_id = ? AND step = ?`,
    )
    .get(change.conversationId, change.portalId, change.step) as WorkflowStep | undefined;
  const starting = change.status === 'pending' || change.status === 'in_progress';
  const finishing =
    change.status === 'done' || change.status === 'failed' || change.status === 'stopped';
  const row = WorkflowStep.parse({
    id: existing?.id ?? newId(),
    conversation_id: change.conversationId,
    portal_id: change.portalId,
    step: change.step,
    status: change.status,
    run_id: change.runId !== undefined ? change.runId : (existing?.run_id ?? null),
    session_id: change.sessionId !== undefined ? change.sessionId : (existing?.session_id ?? null),
    error_ref: change.status === 'failed' ? (change.errorRef ?? null) : null,
    // started_at = when the step was first requested; the step recorder matches runs and
    // sessions that started after it, so pending → in_progress must not move it.
    started_at:
      starting && !(existing?.status === 'pending' || existing?.status === 'in_progress')
        ? now
        : (existing?.started_at ?? null),
    finished_at: finishing ? now : null,
    updated_at: now,
  });
  raw
    .prepare(
      `INSERT INTO workflow_steps
         (id, conversation_id, portal_id, step, status, run_id, session_id, error_ref, started_at, finished_at, updated_at)
       VALUES (@id, @conversation_id, @portal_id, @step, @status, @run_id, @session_id, @error_ref, @started_at, @finished_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status, run_id = excluded.run_id, session_id = excluded.session_id,
         error_ref = excluded.error_ref, started_at = excluded.started_at,
         finished_at = excluded.finished_at, updated_at = excluded.updated_at`,
    )
    .run(row);
  return row;
}
