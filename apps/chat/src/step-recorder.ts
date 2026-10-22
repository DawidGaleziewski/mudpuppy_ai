// Step recorder (R-30 T022, FR-009, FR-019, SC-004): keeps `workflow_steps` true to the recorded
// work. Requests are written as `pending` by the MCP tools; this module moves them on from what the
// store shows (a run or analysis session started after the request) and from the agent's events
// (the crawler/ba subagent started or finished). It runs after every chat event and on a timer, so
// the tracker is right after a reload or a service restart without the chat being open.

import type BetterSqlite3 from 'better-sqlite3';
import type { EvidenceStore } from '@mudpuppy/core';
import type { WorkflowStepName, WorkflowStepStatus } from '@mudpuppy/chat-model';
import { reanchorAfterRun, reanchorNotice } from './reanchor.js';
import type { ErrorInput, LogResult } from './error-log.js';
import type { ChatEvent } from './events.js';
import { RunRefusal, stopRun } from './runs.js';
import { recordStep } from './steps.js';

type StepEvent = Extract<ChatEvent, { type: 'step_changed' }>;

interface StepRow {
  conversation_id: string;
  portal_id: string;
  step: WorkflowStepName;
  status: WorkflowStepStatus;
  started_at: string | null;
  updated_at: string;
  run_id: string | null;
  session_id: string | null;
}

interface RunWork {
  id: string;
  status: string;
  warning: string | null;
  ended_at: string | null;
}
type Work = RunWork & { kind: 'run' | 'session' };

/** Which steps a subagent works on: the crawler scans and traces processes (spec 011 FR-019). */
const STEPS_OF_AGENT: Record<string, readonly WorkflowStepName[]> = {
  crawler: ['scan', 'map'],
  ba: ['document'],
};

export interface StepRecorderOptions {
  raw: BetterSqlite3.Database;
  logError: (input: ErrorInput) => Promise<LogResult>;
  /** Evidence store for state layouts; without it amendments are not checked after a run. */
  evidence?: EvidenceStore;
  /** Clock in ms (tests); default `Date.now`. */
  now?: () => number;
}

/** How long a step in progress may wait for its run or session to appear (F-17). */
export const START_TIMEOUT_MS = 10 * 60_000;

export class StepRecorder {
  /** toolCallId → subagent name, per conversation, for Agent calls still running. */
  private readonly agentCalls = new Map<string, Map<string, string>>();
  /** Subagents launched in the background in the running turn, per conversation (F-17, F-20). */
  private readonly backgroundCalls = new Map<string, { agent: string; toolCallId: string }[]>();

  constructor(private readonly opts: StepRecorderOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private openRows(conversationId: string | null): StepRow[] {
    const sql = `SELECT conversation_id, portal_id, step, status, started_at, updated_at, run_id, session_id
                 FROM workflow_steps WHERE status IN ('pending','in_progress')`;
    return (
      conversationId === null
        ? this.opts.raw.prepare(sql).all()
        : this.opts.raw.prepare(`${sql} AND conversation_id = ?`).all(conversationId)
    ) as StepRow[];
  }

  private change(
    row: StepRow,
    status: WorkflowStepStatus,
    extra: { runId?: string; sessionId?: string; errorRef?: string | null } = {},
  ): StepEvent | null {
    const sameLink =
      (extra.runId === undefined || extra.runId === row.run_id) &&
      (extra.sessionId === undefined || extra.sessionId === row.session_id);
    if (status === row.status && sameLink) return null;
    recordStep(this.opts.raw, {
      conversationId: row.conversation_id,
      portalId: row.portal_id,
      step: row.step,
      status,
      ...(extra.runId === undefined ? {} : { runId: extra.runId }),
      ...(extra.sessionId === undefined ? {} : { sessionId: extra.sessionId }),
      ...(extra.errorRef === undefined ? {} : { errorRef: extra.errorRef }),
    });
    row.status = status;
    if (extra.runId !== undefined) row.run_id = extra.runId;
    if (extra.sessionId !== undefined) row.session_id = extra.sessionId;
    return { type: 'step_changed', step: row.step, status, errorRef: extra.errorRef ?? null };
  }

  private async fail(row: StepRow, message: string, detail: unknown): Promise<StepEvent | null> {
    const { ref } = await this.opts.logError({
      conversation_id: row.conversation_id,
      step: row.step,
      where: 'step-recorder',
      message,
      detail,
    });
    return this.change(row, 'failed', { errorRef: ref });
  }

  /** Newest run or session of the step's kind that started at or after the request. */
  /** Pages the run recorded (one observation per visit of a state). */
  private pagesOf(runId: string): number {
    return (
      this.opts.raw
        .prepare(`SELECT count(DISTINCT state_id) AS n FROM state_observations WHERE run_id = ?`)
        .get(runId) as { n: number }
    ).n;
  }

  private workAfter(row: StepRow): Work | null {
    const since = row.started_at ?? row.updated_at;
    if (row.step === 'scan' || row.step === 'map') {
      // A linked run is followed by id: a resumed run (T041) started before the request.
      if (row.run_id !== null) {
        const linked = this.opts.raw
          .prepare(`SELECT id, status, warning, ended_at FROM runs WHERE id = ?`)
          .get(row.run_id) as RunWork | undefined;
        if (linked !== undefined) return { ...linked, kind: 'run' };
      }
      const r = this.opts.raw
        .prepare(
          `SELECT id, status, warning, ended_at FROM runs
           WHERE portal_id = ? AND mode = ? AND started_at >= ?
           ORDER BY started_at DESC LIMIT 1`,
        )
        .get(row.portal_id, row.step === 'scan' ? 'map' : 'trace', since) as RunWork | undefined;
      return r === undefined ? null : { ...r, kind: 'run' };
    }
    if (row.step === 'document') {
      const s = this.opts.raw
        .prepare(
          `SELECT id, status FROM analysis_sessions WHERE portal_id = ? AND started_at >= ?
           ORDER BY started_at DESC LIMIT 1`,
        )
        .get(row.portal_id, since) as { id: string; status: string } | undefined;
      return s === undefined ? null : { ...s, warning: null, ended_at: null, kind: 'session' };
    }
    return null;
  }

  private startOverdue(row: StepRow): boolean {
    const since = Date.parse(row.started_at ?? row.updated_at);
    return this.now() - since > START_TIMEOUT_MS;
  }

  /**
   * A run interrupted before this step was requested is the one a resume asked for (T041): the
   * step waits for the crawler to restart it instead of failing on the old interruption.
   */
  private awaitingResume(row: StepRow, work: Work): boolean {
    const since = row.started_at ?? row.updated_at;
    return (
      work.kind === 'run' &&
      work.status === 'interrupted' &&
      work.ended_at !== null &&
      work.ended_at < since
    );
  }

  /** Move open steps on from the recorded work. Returns the changes per conversation. */
  async reconcile(conversationId: string | null = null): Promise<Map<string, ChatEvent[]>> {
    const out = new Map<string, ChatEvent[]>();
    const push = (row: StepRow, e: ChatEvent | null): void => {
      if (e === null) return;
      out.set(row.conversation_id, [...(out.get(row.conversation_id) ?? []), e]);
    };
    for (const row of this.openRows(conversationId)) {
      const work = this.workAfter(row);
      if (work === null || this.awaitingResume(row, work)) {
        // A background subagent that never starts its run (a refused start_run) would leave
        // the step in progress forever (F-17).
        if (row.status === 'in_progress' && this.startOverdue(row))
          push(
            row,
            await this.fail(
              row,
              `No ${row.step === 'document' ? 'documentation session' : 'run'} started within ${String(START_TIMEOUT_MS / 60_000)} minutes of the request; the assistant's last messages say why.`,
              { step: row.step, run: row.run_id },
            ),
          );
        continue;
      }
      const link = work.kind === 'run' ? { runId: work.id } : { sessionId: work.id };
      if (work.status === 'running') push(row, this.change(row, 'in_progress', link));
      else if (work.status === 'completed') {
        push(row, this.change(row, 'done', link));
        // T032 / spec 022 R4: a finished scan the BA started carries amendments forward to the
        // new revisions of their screens, or flags them for re-anchoring (FR-021, FE-S02).
        if (work.kind === 'run' && this.opts.evidence !== undefined) {
          const text = reanchorNotice(
            reanchorAfterRun(this.opts.raw, this.opts.evidence, row.portal_id, work.id),
          );
          if (text !== null) push(row, { type: 'notice', text });
        }
      } else {
        this.change(row, row.status, link);
        push(
          row,
          await this.fail(
            row,
            work.kind === 'run'
              ? work.status === 'interrupted'
                ? this.pagesOf(work.id) === 0
                  ? // Nothing to resume (spec 011 F-07): usually an address nothing answers.
                    `The ${row.step} ended without recording any page (run ${work.id}). The portal's address may be wrong or the site down: check it under [settings], or ask the assistant what the crawler saw.`
                  : `The ${row.step} was stopped before it finished (run ${work.id}). Ask the assistant to resume it; it continues from the pages still queued.`
                : `The ${row.step} stopped before it finished${work.warning ? `: ${work.warning}` : '.'}`
              : 'The documentation stopped before it finished.',
            {
              [work.kind]: work.id,
              status: work.status,
              warning: work.warning,
              ...(work.kind === 'run' ? { pages: this.pagesOf(work.id) } : {}),
            },
          ),
        );
      }
    }
    return out;
  }

  /**
   * React to one chat event of a conversation: a crawler/ba subagent starting moves its pending
   * step to in progress; one finishing reconciles, and a step still waiting for work after its
   * agent finished failed to start (for example a safety gate refused the run).
   */
  async observe(conversationId: string, event: ChatEvent): Promise<ChatEvent[]> {
    const calls = this.agentCalls.get(conversationId) ?? new Map<string, string>();
    this.agentCalls.set(conversationId, calls);
    if (event.type === 'tool_started' && event.tool === 'Agent' && event.agent !== null) {
      calls.set(event.toolCallId, event.agent);
      const steps = STEPS_OF_AGENT[event.agent];
      if (steps === undefined) return [];
      const events: StepEvent[] = [];
      for (const row of this.openRows(conversationId))
        if (steps.includes(row.step) && row.status === 'pending') {
          const e = this.change(row, 'in_progress');
          if (e !== null) events.push(e);
        }
      return events;
    }
    // The agent name may be known only at the end: its input streams in after the call starts.
    const finishedAgent =
      event.type === 'tool_finished' && event.tool === 'Agent'
        ? (event.agent ?? calls.get(event.toolCallId) ?? null)
        : null;
    if (event.type === 'tool_finished' && finishedAgent !== null) {
      calls.delete(event.toolCallId);
      // A background launch is not the subagent's end (F-17). The turn stays open until the
      // subagent ends (seen live, F-20), so its end checks run when the turn ends.
      if (event.background === true) {
        const waiting = this.backgroundCalls.get(conversationId) ?? [];
        waiting.push({ agent: finishedAgent, toolCallId: event.toolCallId });
        this.backgroundCalls.set(conversationId, waiting);
        return (await this.reconcile(conversationId)).get(conversationId) ?? [];
      }
      return this.endChecks(conversationId, finishedAgent, event.toolCallId, event.status);
    }
    if (event.type === 'idle') {
      const waiting = this.backgroundCalls.get(conversationId) ?? [];
      this.backgroundCalls.delete(conversationId);
      const events: ChatEvent[] = [];
      for (const w of waiting)
        events.push(...(await this.endChecks(conversationId, w.agent, w.toolCallId, 'completed')));
      return events;
    }
    return [];
  }

  /** Mark a run left running `interrupted`; false when it is no longer running. */
  private interrupt(runId: string): boolean {
    try {
      stopRun(this.opts.raw, runId);
      return true;
    } catch (error) {
      if (error instanceof RunRefusal) return false;
      throw error;
    }
  }

  /**
   * After a crawler/ba subagent ended: reconcile, then fail a step still waiting for work (for
   * example a safety gate refused the run) or left with its run marked running.
   */
  private async endChecks(
    conversationId: string,
    agent: string,
    toolCallId: string,
    status: string,
  ): Promise<ChatEvent[]> {
    const events = (await this.reconcile(conversationId)).get(conversationId) ?? [];
    const steps = STEPS_OF_AGENT[agent] ?? [];
    for (const row of this.openRows(conversationId)) {
      if (!steps.includes(row.step)) continue;
      const work = this.workAfter(row);
      // Seen in real runs (F-13, F-22): the crawler ended its turn with pages still queued, so
      // finish_run was refused and the run stayed "running" with nobody on it, shown as live for
      // hours. The run is stopped here, the same way as "Stop scan", so it can be resumed.
      const stopped = work?.status === 'running' && work.kind === 'run' && this.interrupt(work.id);
      const message =
        work === null
          ? `The ${agent} agent finished without starting the ${row.step === 'map' ? 'process trace' : row.step}; its last message in the chat says why.`
          : stopped
            ? `The ${agent} agent stopped before finishing run ${work.id}, so the run was stopped. Pages already recorded are kept; ask the assistant to resume it to continue from the pages still queued.`
            : work.status === 'running'
              ? `The ${agent} agent stopped while its ${work.kind} ${work.id} is still marked running; its last message in the chat says why.`
              : this.awaitingResume(row, work)
                ? `The ${agent} agent finished without resuming ${work.kind} ${work.id}; its last message in the chat says why.`
                : null;
      if (message === null) continue;
      const e = await this.fail(row, message, {
        agent,
        toolCallId,
        status,
        ...(work === null ? {} : { [work.kind]: work.id }),
      });
      if (e !== null) events.push(e);
    }
    return events;
  }
}
