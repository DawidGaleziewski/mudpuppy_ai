// T041 (F-13): stopping a scan from the dashboard or the chat.

import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { findError, logError } from '../src/error-log.js';
import {
  conversationsOfRun,
  runningRunOf,
  runningRunsOfConversation,
  stopRun,
  stoppedNotice,
} from '../src/runs.js';
import { recordStep } from '../src/steps.js';
import { testService, until } from './helpers.js';

const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-000000000001';

describe('stop a run', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  let logsDir: string;
  const raw = () => t.opened.raw;

  function addRun(id: string, status: string, startedAt = '2026-10-06T08:00:00.000Z'): void {
    raw()
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
           locale, browser, config_snapshot, status, started_at)
         VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1280x800', 'pl-PL', 'chromium', '{}', ?, ?)`,
      )
      .run(id, P, status, startedAt);
  }
  const statusOf = (id: string) =>
    raw().prepare(`SELECT status, ended_at FROM runs WHERE id = ?`).get(id) as {
      status: string;
      ended_at: string | null;
    };

  beforeEach(async () => {
    t = testService();
    logsDir = await mkdtemp(join(tmpdir(), 'chat-runs-'));
    server = createApi({
      service: t.service,
      logError: (input) => logError(input, { logsDir }),
      findError: (ref) => findError(ref, { logsDir }),
      version: '1.2.3',
      stopRun: (id) => stopRun(raw(), id),
      runsOfConversation: (id) => runningRunsOfConversation(raw(), id),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });

  afterEach(async () => {
    t.service.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await t.opened.close();
    await rm(logsDir, { recursive: true, force: true });
  });

  it('marks a running run interrupted, so it can be resumed', () => {
    addRun('r1', 'running');
    expect(stopRun(raw(), 'r1')).toEqual({
      run_id: 'r1',
      portal_id: P,
      mode: 'map',
      status: 'interrupted',
    });
    expect(statusOf('r1').status).toBe('interrupted');
    expect(statusOf('r1').ended_at).not.toBeNull();
  });

  it('refuses unknown and finished runs and leaves them unchanged', () => {
    addRun('done', 'completed');
    expect(() => stopRun(raw(), 'ghost')).toThrow(/does not exist/);
    expect(() => stopRun(raw(), 'done')).toThrow(/is completed, not running/);
    expect(statusOf('done').status).toBe('completed');
  });

  it('finds the newest running run of a portal, and the conversations following a run', () => {
    expect(() => runningRunOf(raw(), P)).toThrow(/no scan of reference-insurer is running/);
    addRun('old', 'running', '2026-10-06T07:00:00.000Z');
    addRun('new', 'running', '2026-10-06T08:00:00.000Z');
    expect(runningRunOf(raw(), P)).toBe('new');
    raw()
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at)
         VALUES (?, ?, '', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      )
      .run(CONV, P);
    recordStep(raw(), {
      conversationId: CONV,
      portalId: P,
      step: 'scan',
      status: 'in_progress',
      runId: 'new',
    });
    expect(conversationsOfRun(raw(), 'new')).toEqual([CONV]);
    expect(conversationsOfRun(raw(), 'old')).toEqual([]);
  });

  it('POST /runs/<id>/stop answers 200, then 409 for a run no longer running, 404 for none', async () => {
    addRun('r1', 'running');
    const stop = (id: string) => fetch(`${base}/runs/${id}/stop`, { method: 'POST' });
    const first = await stop('r1');
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ run_id: 'r1', status: 'interrupted' });
    const again = await stop('r1');
    expect(again.status).toBe(409);
    expect(((await again.json()) as { message: string }).message).toContain('not running');
    expect((await stop('ghost')).status).toBe(404);
  });

  it('POST /conversations/<id>/cancel ends the turn and stops only that conversation’s runs (T050)', async () => {
    const { conversation } = await t.service.createConversation({ portal: P });
    addRun('mine', 'running');
    addRun('other', 'running');
    recordStep(raw(), {
      conversationId: conversation.id,
      portalId: P,
      step: 'scan',
      status: 'in_progress',
      runId: 'mine',
    });
    await t.service.send(conversation.id, 'hang');
    await until(() => t.log.prompts.includes('hang'));
    const res = await fetch(`${base}/conversations/${conversation.id}/cancel`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ turn: true, runs: [{ run_id: 'mine' }] });
    expect(statusOf('mine').status).toBe('interrupted');
    expect(statusOf('other').status).toBe('running');
    expect(t.log.cancelled).toBe(1);
    await until(() => !t.service.isBusy(conversation.id));
    await t.service.drain(conversation.id);
    const messages = await t.store.listMessages(conversation.id);
    expect(messages.map((m) => m.content)).toContain(
      'You stopped the assistant. Send a message to continue.',
    );
    // nothing running any more: still 200, nothing stopped
    const again = await fetch(`${base}/conversations/${conversation.id}/cancel`, {
      method: 'POST',
    });
    expect(await again.json()).toEqual({ turn: false, runs: [] });
    expect((await fetch(`${base}/conversations/ghost/cancel`, { method: 'POST' })).status).toBe(
      404,
    );
  });

  it('POST /conversations/<id>/reset answers 200, 409 while answering, 404 for none (T051)', async () => {
    const { conversation } = await t.service.createConversation({ portal: P });
    const reset = (id: string) => fetch(`${base}/conversations/${id}/reset`, { method: 'POST' });
    const ok = await reset(conversation.id);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ reset: true });
    await t.service.send(conversation.id, 'hang');
    await until(() => t.log.prompts.includes('hang'));
    const busy = await reset(conversation.id);
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as { message: string }).message).toContain('[stop]');
    await t.service.cancel(conversation.id);
    await until(() => !t.service.isBusy(conversation.id));
    expect((await reset('ghost')).status).toBe(404);
  });

  it('the notice tells the BA the run can be resumed', () => {
    expect(stoppedNotice({ run_id: 'r1', portal_id: P, mode: 'map', status: 'interrupted' })).toBe(
      'The scan of reference-insurer was stopped (run r1). Pages already recorded are kept; press [resume scan] in the step tracker, or ask the assistant, to continue from the pages still queued.',
    );
    // A trace has no [resume scan]: it is traced again.
    expect(
      stoppedNotice({ run_id: 'r2', portal_id: P, mode: 'trace', status: 'interrupted' }),
    ).toBe(
      'The process trace of reference-insurer was stopped (run r2). Steps already recorded are kept; ask the assistant to trace the process again.',
    );
  });

  it('a stop the BA asked for marks the run’s steps stopped, with no error reference (F-04)', async () => {
    const { conversation } = await t.service.createConversation({ portal: P });
    const conversationId = conversation.id;
    const stepOf = () =>
      raw()
        .prepare(`SELECT status, error_ref FROM workflow_steps WHERE conversation_id = ?`)
        .get(conversationId) as { status: string; error_ref: string | null };
    addRun('auto', 'running');
    recordStep(raw(), { conversationId, portalId: P, step: 'scan', status: 'in_progress', runId: 'auto' });
    stopRun(raw(), 'auto'); // an agent left it running: the step recorder decides
    expect(stepOf().status).toBe('in_progress');
    addRun('ba', 'running', '2026-10-06T09:00:00.000Z');
    recordStep(raw(), { conversationId, portalId: P, step: 'scan', status: 'in_progress', runId: 'ba' });
    stopRun(raw(), 'ba', { byBa: true });
    expect(stepOf()).toEqual({ status: 'stopped', error_ref: null });
  });
});
