import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenedDb } from '@pathfinder/store';
import type { ErrorInput } from '../src/error-log.js';
import type { ChatEvent } from '../src/events.js';
import { StepRecorder } from '../src/step-recorder.js';
import { recordStep } from '../src/steps.js';
import { memoryStore, testService, until } from './helpers.js';

const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-000000000001';
let opened: OpenedDb;
let errors: ErrorInput[];
let recorder: StepRecorder;
let clock: number;

function addRun(
  id: string,
  mode: string,
  status: string,
  startedAt: string,
  warning: string | null = null,
  endedAt: string | null = null,
): void {
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, warning, started_at, ended_at)
       VALUES (?, ?, 'guest', ?, 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', ?, ?, ?, ?)`,
    )
    .run(id, P, mode, status, warning, startedAt, endedAt);
}

/** A run stopped before the 01:00 request, as a resume finds it. */
function addStoppedRun(id: string): void {
  addRun(id, 'map', 'interrupted', '2026-10-05T23:00:00.000Z', null, '2026-10-05T23:30:00.000Z');
}

/** One page the run recorded (a state and its observation). */
function addPage(runId: string): void {
  const at = '2026-10-06T01:02:00.000Z';
  opened.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, ?, ?, 'c', '/', 't', 'ev', 'observed', 'settled', ?, ?)`,
    )
    .run(`s-${runId}`, P, `fp-${runId}`, runId, at);
  opened.raw
    .prepare(
      `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at) VALUES (?, ?, 'guest', 'ev', ?)`,
    )
    .run(runId, `s-${runId}`, at);
}

function setRun(id: string, status: string): void {
  opened.raw
    .prepare(`UPDATE runs SET status = ?, ended_at = '2026-10-06T01:30:00.000Z' WHERE id = ?`)
    .run(status, id);
}

function runStatus(id: string): string {
  return (opened.raw.prepare(`SELECT status FROM runs WHERE id = ?`).get(id) as { status: string })
    .status;
}

function step(name: string): { status: string; run_id: string | null; error_ref: string | null } {
  return opened.raw
    .prepare(
      `SELECT status, run_id, error_ref FROM workflow_steps WHERE conversation_id = ? AND step = ?`,
    )
    .get(CONV, name) as { status: string; run_id: string | null; error_ref: string | null };
}

beforeEach(() => {
  ({ opened } = memoryStore());
  opened.raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
    )
    .run(CONV, P, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z');
  errors = [];
  clock = Date.parse('2026-10-06T01:05:00Z');
  recorder = new StepRecorder({
    now: () => clock,
    raw: opened.raw,
    logError: (input) => {
      errors.push(input);
      return Promise.resolve({ ref: `ERR-T${String(errors.length)}`, logged: true });
    },
  });
  recordStep(opened.raw, {
    conversationId: CONV,
    portalId: P,
    step: 'scan',
    status: 'pending',
    now: new Date('2026-10-06T01:00:00Z'),
  });
});
afterEach(async () => {
  await opened.close();
});

describe('StepRecorder.reconcile', () => {
  it('moves a requested scan to in progress, then done, linked to its run', async () => {
    addRun('run-1', 'map', 'running', '2026-10-06T01:01:00.000Z');
    expect((await recorder.reconcile()).get(CONV)).toEqual([
      { type: 'step_changed', step: 'scan', status: 'in_progress', errorRef: null },
    ]);
    expect(step('scan')).toMatchObject({ status: 'in_progress', run_id: 'run-1' });
    setRun('run-1', 'completed');
    await recorder.reconcile(CONV);
    expect(step('scan')).toMatchObject({ status: 'done', run_id: 'run-1' });
    expect((await recorder.reconcile()).size).toBe(0);
  });

  it('a run that stopped on a warning fails the step with a logged reference', async () => {
    addRun('run-1', 'map', 'stopped_warning', '2026-10-06T01:01:00.000Z', 'CAPTCHA');
    const changes = await recorder.reconcile();
    expect(changes.get(CONV)).toEqual([
      { type: 'step_changed', step: 'scan', status: 'failed', errorRef: 'ERR-T1' },
    ]);
    expect(step('scan')).toMatchObject({ status: 'failed', error_ref: 'ERR-T1', run_id: 'run-1' });
    expect(errors[0]?.message).toContain('CAPTCHA');
  });

  it('ignores runs that started before the request', async () => {
    addRun('old', 'map', 'completed', '2026-10-05T23:00:00.000Z');
    expect((await recorder.reconcile()).size).toBe(0);
    expect(step('scan').status).toBe('pending');
  });

  it('does not take a trace run for a scan', async () => {
    addRun('t-1', 'trace', 'completed', '2026-10-06T01:01:00.000Z');
    expect((await recorder.reconcile()).size).toBe(0);
  });

  it('a stopped run fails the step and says it can be resumed (T041)', async () => {
    addRun('run-1', 'map', 'running', '2026-10-06T01:01:00.000Z');
    await recorder.reconcile();
    addPage('run-1');
    setRun('run-1', 'interrupted');
    await recorder.reconcile();
    expect(step('scan')).toMatchObject({ status: 'failed', run_id: 'run-1' });
    expect(errors.at(-1)?.message).toContain('Ask the assistant to resume it');
  });

  it('a run that ended with no page says the address may be wrong, not "resume it" (spec 011 F-07)', async () => {
    addRun('run-1', 'map', 'running', '2026-10-06T01:01:00.000Z');
    await recorder.reconcile();
    setRun('run-1', 'interrupted');
    await recorder.reconcile();
    expect(step('scan')).toMatchObject({ status: 'failed' });
    expect(errors.at(-1)?.message).toContain('without recording any page');
    expect(errors.at(-1)?.message).not.toContain('resume');
    expect(errors.at(-1)?.detail).toMatchObject({ pages: 0 });
  });

  it('a resume follows the linked run, which started before the request (T041)', async () => {
    addStoppedRun('old');
    recordStep(opened.raw, {
      conversationId: CONV,
      portalId: P,
      step: 'scan',
      status: 'pending',
      runId: 'old',
    });
    // waiting for the crawler to restart it: no failure while it is still interrupted
    expect((await recorder.reconcile()).size).toBe(0);
    expect(step('scan')).toMatchObject({ status: 'pending', run_id: 'old' });
    setRun('old', 'running');
    await recorder.reconcile();
    expect(step('scan')).toMatchObject({ status: 'in_progress', run_id: 'old' });
    setRun('old', 'completed');
    await recorder.reconcile();
    expect(step('scan')).toMatchObject({ status: 'done', run_id: 'old' });
  });
});

describe('StepRecorder.observe', () => {
  const started: ChatEvent = {
    type: 'tool_started',
    toolCallId: 'a1',
    tool: 'Agent',
    title: 'crawler',
    parentToolCallId: null,
    agent: 'crawler',
  };
  const finished: ChatEvent = {
    type: 'tool_finished',
    toolCallId: 'a1',
    tool: 'Agent',
    status: 'completed',
    parentToolCallId: null,
    agent: 'crawler',
  };

  it('real-run shape (F-13, F-22): agent unknown at start, known at finish, run left running → stopped, failed', async () => {
    await recorder.observe(CONV, { ...started, agent: null });
    addRun('run-1', 'map', 'running', '2026-10-06T01:02:00.000Z');
    const events = await recorder.observe(CONV, finished);
    expect(events.at(-1)).toEqual({
      type: 'step_changed',
      step: 'scan',
      status: 'failed',
      errorRef: expect.stringMatching(/^ERR-T/),
    });
    expect(errors.at(-1)?.message).toContain('so the run was stopped');
    expect(errors.at(-1)?.message).toContain('resume');
    expect(step('scan')).toMatchObject({ status: 'failed', run_id: 'run-1' });
    expect(runStatus('run-1')).toBe('interrupted');
  });

  it('a background launch is not the crawler finishing (F-17): the scan stays in progress', async () => {
    await recorder.observe(CONV, started);
    // "Async agent launched": the tool call ends at once, no run exists yet
    expect(await recorder.observe(CONV, { ...finished, background: true })).toEqual([]);
    expect(step('scan').status).toBe('in_progress');
    addRun('run-1', 'map', 'running', '2026-10-06T01:02:00.000Z');
    await recorder.reconcile();
    expect(step('scan')).toMatchObject({ status: 'in_progress', run_id: 'run-1' });
    setRun('run-1', 'completed');
    await recorder.reconcile();
    expect(step('scan').status).toBe('done');
    expect(errors).toEqual([]);
  });

  it('a background crawler is checked when the turn ends (F-20): run left running → failed', async () => {
    await recorder.observe(CONV, started);
    await recorder.observe(CONV, { ...finished, background: true });
    addRun('run-1', 'map', 'running', '2026-10-06T01:02:00.000Z');
    await recorder.reconcile();
    expect(step('scan').status).toBe('in_progress');
    await recorder.observe(CONV, { type: 'idle' });
    expect(step('scan').status).toBe('failed');
    expect(errors.at(-1)?.message).toContain('so the run was stopped');
    expect(runStatus('run-1')).toBe('interrupted');
    // a later turn's end does not check it again
    expect(await recorder.observe(CONV, { type: 'idle' })).toEqual([]);
  });

  it('a background crawler whose run completed leaves the scan done at the turn end', async () => {
    await recorder.observe(CONV, started);
    await recorder.observe(CONV, { ...finished, background: true });
    addRun('run-1', 'map', 'completed', '2026-10-06T01:02:00.000Z');
    await recorder.observe(CONV, { type: 'idle' });
    expect(step('scan').status).toBe('done');
    expect(errors).toEqual([]);
  });

  it('a background crawler that never starts a run fails the step after the start timeout', async () => {
    await recorder.observe(CONV, started);
    await recorder.observe(CONV, { ...finished, background: true });
    clock = Date.parse('2026-10-06T01:09:00Z');
    expect((await recorder.reconcile()).size).toBe(0);
    clock = Date.parse('2026-10-06T01:11:00Z');
    await recorder.reconcile();
    expect(step('scan').status).toBe('failed');
    expect(errors.at(-1)?.message).toContain('No run started within 10 minutes');
  });

  it('a resume in progress waits while the crawler restarts the run; finishing without it fails', async () => {
    addStoppedRun('old');
    recordStep(opened.raw, {
      conversationId: CONV,
      portalId: P,
      step: 'scan',
      status: 'pending',
      runId: 'old',
    });
    await recorder.observe(CONV, started);
    expect(step('scan').status).toBe('in_progress');
    // the timer runs before the crawler's start_run: the old interruption must not fail the step
    expect((await recorder.reconcile()).size).toBe(0);
    expect(step('scan').status).toBe('in_progress');
    await recorder.observe(CONV, finished);
    expect(step('scan').status).toBe('failed');
    expect(errors.at(-1)?.message).toContain('finished without resuming run old');
  });

  it('an Agent call with an unknown agent at both ends changes nothing', async () => {
    expect(await recorder.observe(CONV, { ...finished, toolCallId: 'zz', agent: null })).toEqual(
      [],
    );
  });

  it('the crawler starting moves the pending scan to in progress', async () => {
    expect(await recorder.observe(CONV, started)).toEqual([
      { type: 'step_changed', step: 'scan', status: 'in_progress', errorRef: null },
    ]);
    expect(step('scan').status).toBe('in_progress');
  });

  it('the crawler finishing without a run fails the scan (for example a gate refusal)', async () => {
    await recorder.observe(CONV, started);
    const events = await recorder.observe(CONV, finished);
    expect(events).toEqual([
      { type: 'step_changed', step: 'scan', status: 'failed', errorRef: 'ERR-T1' },
    ]);
    expect(errors[0]?.message).toContain('without starting the scan');
  });

  it('the crawler finishing after a completed run marks the scan done', async () => {
    await recorder.observe(CONV, started);
    addRun('run-1', 'map', 'completed', '2026-10-06T01:02:00.000Z');
    expect(await recorder.observe(CONV, finished)).toEqual([
      { type: 'step_changed', step: 'scan', status: 'done', errorRef: null },
    ]);
  });

  it('the crawler works on the "map a process" step too: trace run → in progress, then done (spec 011 FR-019)', async () => {
    recordStep(opened.raw, { conversationId: CONV, portalId: P, step: 'scan', status: 'done' });
    recordStep(opened.raw, {
      conversationId: CONV,
      portalId: P,
      step: 'map',
      status: 'pending',
      now: new Date('2026-10-06T01:00:00Z'),
    });
    expect(await recorder.observe(CONV, started)).toEqual([
      { type: 'step_changed', step: 'map', status: 'in_progress', errorRef: null },
    ]);
    addRun('trace-1', 'trace', 'completed', '2026-10-06T01:02:00.000Z');
    expect(await recorder.observe(CONV, finished)).toEqual([
      { type: 'step_changed', step: 'map', status: 'done', errorRef: null },
    ]);
  });

  it('the crawler finishing without a trace run fails the process step in plain words', async () => {
    recordStep(opened.raw, { conversationId: CONV, portalId: P, step: 'scan', status: 'done' });
    recordStep(opened.raw, {
      conversationId: CONV,
      portalId: P,
      step: 'map',
      status: 'pending',
      now: new Date('2026-10-06T01:00:00Z'),
    });
    await recorder.observe(CONV, started);
    expect(await recorder.observe(CONV, finished)).toEqual([
      { type: 'step_changed', step: 'map', status: 'failed', errorRef: 'ERR-T1' },
    ]);
    expect(errors[0]?.message).toContain('without starting the process trace');
  });

  it('ignores other tools', async () => {
    expect(
      await recorder.observe(CONV, {
        ...started,
        tool: 'mcp__pathfinder-chat__workflow_state',
        agent: null,
      }),
    ).toEqual([]);
  });
});

describe('ChatService with the recorder', () => {
  it('publishes injected step changes and tells the chat when a step failed', async () => {
    const t = testService();
    const { conversation } = await t.service.createConversation({ portal: P });
    const seen: ChatEvent[] = [];
    t.service.subscribe(conversation.id, null, (e) => seen.push(e.event));
    t.service.inject(conversation.id, [
      { type: 'step_changed', step: 'scan', status: 'failed', errorRef: 'ERR-X' },
    ]);
    await t.service.drain(conversation.id);
    await until(() => seen.length === 1);
    const messages = await t.store.listMessages(conversation.id);
    expect(messages.at(-1)).toMatchObject({ role: 'system', error_ref: 'ERR-X' });
    expect(messages.at(-1)?.content).toContain('scan step failed');
    await t.opened.close();
  });
});
