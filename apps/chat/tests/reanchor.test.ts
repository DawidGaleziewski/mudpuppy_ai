import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceStore, type EvidenceStore } from '@pathfinder/core';
import { type OpenedDb } from '@pathfinder/store';
import { StepRecorder } from '../src/step-recorder.js';
import { recordStep } from '../src/steps.js';
import { reanchorAfterRun } from '../src/reanchor.js';
import { memoryStore } from './helpers.js';

const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-000000000001';
const T0 = '2026-10-06T00:00:00.000Z';
let opened: OpenedDb;
let dir: string;
let evidence: EvidenceStore;

async function layout(elements: { key: string; role: string; name: string }[]): Promise<string> {
  return evidence.storeJson({
    version: 1,
    viewport: { width: 1366, height: 768 },
    page: { width: 1366, height: 900 },
    cut: false,
    elements: elements.map((e) => ({ ...e, box: null })),
  });
}

function run(id: string, status: string, startedAt: string): void {
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
       VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', ?, ?)`,
    )
    .run(id, P, status, startedAt);
}

function state(id: string, fp: string, route: string, runId: string, layoutRef: string): void {
  opened.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at, layout_ref)
       VALUES (?, ?, ?, 'c', ?, 't', 'ev', 'observed', 'settled', ?, ?, ?)`,
    )
    .run(id, P, fp, route, runId, T0, layoutRef);
  opened.raw
    .prepare(
      `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at) VALUES (?, ?, 'guest', 'ev', ?)`,
    )
    .run(runId, id, T0);
}

function amendment(id: string, key: string, element: object | null): void {
  opened.raw
    .prepare(
      `INSERT INTO amendments (id, key, portal_id, target_kind, target_id, kind, text, author, created_at,
         anchor_fingerprint, anchor_route_template, anchor_element)
       VALUES (?, ?, ?, ?, 's-quote-1', ?, 'make it green', 'BA', ?, 'fp-1', '/quote', ?)`,
    )
    .run(
      id,
      key,
      P,
      element === null ? 'state' : 'wireframe_element',
      element === null ? 'note' : 'element_ref',
      T0,
      element === null ? null : JSON.stringify(element),
    );
}

function status(id: string): Record<string, unknown> {
  return opened.raw
    .prepare(
      `SELECT status, rev, target_id, anchor_fingerprint, superseded_by_run, superseded_reason, superseded_detail
       FROM amendments WHERE id = ?`,
    )
    .get(id) as Record<string, unknown>;
}

function revisions(id: string): Record<string, unknown>[] {
  return opened.raw
    .prepare(
      `SELECT rev, base_rev, change, author, status, target_id, run_id FROM amendment_revisions
       WHERE amendment_id = ? ORDER BY rev`,
    )
    .all(id) as Record<string, unknown>[];
}

beforeEach(async () => {
  ({ opened } = memoryStore());
  dir = mkdtempSync(join(tmpdir(), 'pathfinder-supersede-'));
  evidence = createEvidenceStore(dir);
  run('run-1', 'completed', T0);
  state(
    's-quote-1',
    'fp-1',
    '/quote',
    'run-1',
    await layout([{ key: 'button "Buy now"', role: 'button', name: 'Buy now' }]),
  );
  amendment('a-1', 'AMD-001', {
    key: 'button "Buy now"',
    role: 'button',
    name: 'Buy now',
    roleIndex: 0,
  });
  amendment('a-2', 'AMD-002', null);
});
afterEach(async () => {
  await opened.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('reanchorAfterRun (spec 022 R4)', () => {
  it('a scan that renamed the button: the element note needs re-anchoring, the screen note moves along', async () => {
    run('run-2', 'completed', '2026-10-06T01:00:00.000Z');
    state(
      's-quote-2',
      'fp-2',
      '/quote',
      'run-2',
      await layout([{ key: 'button "Get a quote"', role: 'button', name: 'Get a quote' }]),
    );
    const r = reanchorAfterRun(opened.raw, evidence, P, 'run-2');
    expect(r.needsReanchor.map((s) => s.key)).toEqual(['AMD-001']);
    expect(r.carried.map((s) => s.key)).toEqual(['AMD-002']);
    expect(status('a-1')).toEqual({
      status: 'needs_reanchor',
      rev: 2,
      target_id: 's-quote-1',
      anchor_fingerprint: 'fp-1',
      superseded_by_run: 'run-2',
      superseded_reason: 'element_changed',
      superseded_detail: 'button "Buy now" is now button "Get a quote"',
    });
    expect(status('a-2')).toMatchObject({
      status: 'active',
      rev: 2,
      target_id: 's-quote-2',
      anchor_fingerprint: 'fp-2',
    });
    expect(revisions('a-2')).toEqual([
      {
        rev: 2,
        base_rev: 1,
        change: 'carry_forward',
        author: 'scan:run-2',
        status: 'active',
        target_id: 's-quote-2',
        run_id: 'run-2',
      },
    ]);
    // Nothing is deleted.
    expect(
      (opened.raw.prepare(`SELECT count(*) AS n FROM amendments`).get() as { n: number }).n,
    ).toBe(2);
  });

  it('an element note whose element is still there moves along, target keeps the element key', async () => {
    run('run-2', 'completed', '2026-10-06T01:00:00.000Z');
    state(
      's-quote-2',
      'fp-2',
      '/quote',
      'run-2',
      await layout([
        { key: 'button "Buy now"', role: 'button', name: 'Buy now' },
        { key: 'link "Help"', role: 'link', name: 'Help' },
      ]),
    );
    reanchorAfterRun(opened.raw, evidence, P, 'run-2');
    expect(status('a-1')).toMatchObject({ status: 'active', rev: 2 });
  });

  it('a scan that saw the same screen changes nothing', () => {
    run('run-2', 'completed', '2026-10-06T01:00:00.000Z');
    opened.raw
      .prepare(
        `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at) VALUES ('run-2', 's-quote-1', 'guest', 'ev', ?)`,
      )
      .run(T0);
    const r = reanchorAfterRun(opened.raw, evidence, P, 'run-2');
    expect([...r.carried, ...r.needsReanchor]).toEqual([]);
    expect(status('a-1')).toMatchObject({ status: 'active', rev: 1 });
  });
});

describe('StepRecorder + re-anchoring (T032, spec 022)', () => {
  it('a chat-started scan finishing posts a notice naming the amendments it moved', async () => {
    opened.raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
      )
      .run(CONV, P, T0, T0);
    recordStep(opened.raw, {
      conversationId: CONV,
      portalId: P,
      step: 'scan',
      status: 'pending',
      now: new Date('2026-10-06T00:30:00Z'),
    });
    run('run-2', 'completed', '2026-10-06T01:00:00.000Z');
    state('s-quote-2', 'fp-2', '/quote', 'run-2', await layout([]));
    const recorder = new StepRecorder({
      raw: opened.raw,
      logError: () => Promise.resolve({ ref: 'ERR-X', logged: true }),
      evidence,
    });
    const events = (await recorder.reconcile()).get(CONV) ?? [];
    expect(events[0]).toMatchObject({ type: 'step_changed', step: 'scan', status: 'done' });
    expect(events[1]).toMatchObject({ type: 'notice' });
    const text = (events[1] as { text: string }).text;
    // A layout-less new revision cannot prove the element is gone: both move along.
    expect(text).toContain('moved to the new revision of their screen: AMD-001, AMD-002');
  });
});
