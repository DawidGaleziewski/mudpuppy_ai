import { describe, expect, it, vi } from 'vitest';
import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../src/context.js';
import { getNextFrontierItem } from '../src/services/frontier.js';
import { inferSameTarget, linkTarget } from '../src/services/same-target.js';
import { makeCtx, REF, seedRun } from './helpers.js';

const T = 'https://shop.test/offer';

const linkJson = (target: string, extra: object = {}) =>
  JSON.stringify({
    role: 'link',
    accessible_name: 'Offer',
    target_url: target,
    page_url: 'https://shop.test/home',
    locators: [{ strategy: 'role', value: 'link[name=Offer]' }],
    ...extra,
  });

describe('linkTarget', () => {
  const t = (action_id: string | null, action_json: string) =>
    linkTarget({ action_id, action_json });

  it('returns the http(s) target_url of a plain link', () => {
    expect(t('a1', linkJson(T))).toBe(T);
    expect(t('a1', linkJson('http://shop.test/x'))).toBe('http://shop.test/x');
  });

  it('is null for buttons, fill controls, forms, non-http targets, no action id and bad JSON', () => {
    expect(t('a1', linkJson(T, { role: 'button' }))).toBeNull();
    expect(t('a1', linkJson(T, { input: 'fill' }))).toBeNull();
    expect(t('a1', linkJson(T, { form: { id: 'f1' } }))).toBeNull();
    expect(t('a1', linkJson('mailto:a@b.test'))).toBeNull();
    expect(t('a1', linkJson('javascript:void(0)'))).toBeNull();
    expect(t('a1', JSON.stringify({ role: 'link' }))).toBeNull();
    expect(t(null, linkJson(T))).toBeNull();
    expect(t('a1', '{not json')).toBeNull();
  });
});

type Ctx = ServerContext;

function seedState(ctx: Ctx, runId: string, tag: string): string {
  const id = newId();
  ctx.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title,
         evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, 'shop', ?, ?, '/', ?, ?, 'observed', 'settled', ?, ?)`,
    )
    .run(id, tag.repeat(64).slice(0, 64), id, tag, REF, runId, nowIso());
  return id;
}

function seedEdge(
  ctx: Ctx,
  runId: string,
  from: string,
  over: {
    to: string | null;
    status?: string;
    confidence?: string;
    target?: string;
    name?: string;
  },
): string {
  const id = newId();
  ctx.raw
    .prepare(
      `INSERT INTO edges (id, run_id, from_state, to_state, action_json, safety_class, status,
         evidence_ref, confidence, error, stabilization, created_at)
       VALUES (?, ?, ?, ?, ?, 'read', ?, ?, ?, NULL, 'settled', ?)`,
    )
    .run(
      id,
      runId,
      from,
      over.to,
      JSON.stringify({
        role: 'link',
        accessible_name: over.name ?? 'Offer',
        target_url: over.target ?? T,
      }),
      over.status ?? 'executed',
      REF,
      over.confidence ?? 'observed',
      nowIso(),
    );
  return id;
}

function seedItem(
  ctx: Ctx,
  runId: string,
  stateId: string,
  actionJson: string,
  priority = 0,
): string {
  const actionId = newId();
  const frontierId = newId();
  const ts = nowIso();
  ctx.raw
    .prepare(
      `INSERT INTO actions (id, run_id, state_id, role, accessible_name, action_json, safety_class,
         allowed, skip_reason, created_at) VALUES (?, ?, ?, 'link', 'Offer', ?, 'read', 1, NULL, ?)`,
    )
    .run(actionId, runId, stateId, actionJson, ts);
  ctx.raw
    .prepare(
      `INSERT INTO frontier (id, run_id, state_id, action_id, action_json, safety_class, status,
         priority, depth, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'read', 'pending', ?, 0, NULL, ?, ?)`,
    )
    .run(frontierId, runId, stateId, actionId, actionJson, priority, ts, ts);
  return frontierId;
}

const frontierRow = (ctx: Ctx, id: string) =>
  ctx.raw.prepare('SELECT status, reason FROM frontier WHERE id = ?').get(id) as {
    status: string;
    reason: string | null;
  };

const inferredEdges = (ctx: Ctx, runId: string) =>
  ctx.raw
    .prepare(`SELECT * FROM edges WHERE run_id = ? AND confidence = 'inferred' ORDER BY id`)
    .all(runId) as {
    id: string;
    from_state: string;
    to_state: string | null;
    status: string;
    confidence: string;
    evidence_ref: string;
    action_json: string;
  }[];

async function setup() {
  const ctx = await makeCtx();
  const runId = await seedRun(ctx);
  const s1 = seedState(ctx, runId, 'a');
  const s2 = seedState(ctx, runId, 'b');
  const s3 = seedState(ctx, runId, 'c');
  const s4 = seedState(ctx, runId, 'd');
  return { ctx, runId, s1, s2, s3, s4 };
}

describe('getNextFrontierItem same-target inference', () => {
  it('AS2.1: settles link items whose target was already reached, as inferred edges', async () => {
    const { ctx, runId, s1, s2, s3, s4 } = await setup();
    const seen = seedEdge(ctx, runId, s1, { to: s2 });
    const a = seedItem(ctx, runId, s3, linkJson(T));
    const b = seedItem(ctx, runId, s4, linkJson(T));
    const btn = seedItem(ctx, runId, s3, linkJson('https://shop.test/other', { role: 'button' }));
    const events = vi.spyOn(ctx.tracer, 'event');

    const next = await getNextFrontierItem(ctx, { run_id: runId });

    expect(next).toMatchObject({ item: { frontier_id: btn } });
    for (const id of [a, b]) {
      expect(frontierRow(ctx, id)).toEqual({ status: 'done', reason: `same_target: ${seen}` });
    }
    const inferred = inferredEdges(ctx, runId);
    expect(inferred).toHaveLength(2);
    expect(inferred.map((e) => e.from_state).sort()).toEqual([s3, s4].sort());
    for (const e of inferred) {
      expect(e).toMatchObject({
        to_state: s2,
        status: 'executed',
        confidence: 'inferred',
        evidence_ref: REF,
      });
      const action = JSON.parse(e.action_json) as Record<string, unknown>;
      expect(action).not.toHaveProperty('page_url');
      expect(action.locators).toEqual([{ strategy: 'role', value: 'link[name=Offer]' }]);
    }
    // Trace event per settled item.
    const infers = events.mock.calls.filter(([name]) => name === 'frontier_infer');
    expect(infers).toHaveLength(2);
    expect(infers[0]?.[1]).toMatchObject({ frontier_id: a, same_as_edge_id: seen, to_state: s2 });
  });

  it('AS2.1: with only inferable items the queue is empty', async () => {
    const { ctx, runId, s1, s2, s3 } = await setup();
    seedEdge(ctx, runId, s1, { to: s2 });
    seedItem(ctx, runId, s3, linkJson(T));
    expect(await getNextFrontierItem(ctx, { run_id: runId })).toEqual({
      item: null,
      reason: 'empty',
    });
  });

  it('AS2.2: a skipped / inferred / dead-end edge to the target does not settle the item', async () => {
    const { ctx, runId, s1, s3 } = await setup();
    seedEdge(ctx, runId, s1, { to: null, status: 'skipped', confidence: 'inferred' });
    seedEdge(ctx, runId, s1, { to: null });
    const item = seedItem(ctx, runId, s3, linkJson(T));
    const next = await getNextFrontierItem(ctx, { run_id: runId });
    expect(next).toMatchObject({ item: { frontier_id: item } });
    expect(frontierRow(ctx, item).status).toBe('pending');
    expect(inferredEdges(ctx, runId).filter((e) => e.to_state !== null)).toHaveLength(0);
  });

  it('AS2.3: buttons and links with a different target are handed out, not inferred', async () => {
    const { ctx, runId, s1, s2, s3 } = await setup();
    seedEdge(ctx, runId, s1, { to: s2 });
    const button = seedItem(ctx, runId, s3, linkJson(T, { role: 'button' }));
    const other = seedItem(ctx, runId, s3, linkJson('https://shop.test/else'));
    const first = await getNextFrontierItem(ctx, { run_id: runId });
    // spec 026: a link to a route template the run has not visited goes before a button
    expect(first).toMatchObject({ item: { frontier_id: other } });
    expect(await inferSameTarget(ctx, { ...rowOf(ctx, other) })).toBe(false);
    expect(frontierRow(ctx, other).status).toBe('pending');
    expect(frontierRow(ctx, button).status).toBe('pending');
    expect(inferredEdges(ctx, runId)).toHaveLength(0);
  });

  it('queue order: a higher-priority inferable item ahead of a normal one returns the normal one', async () => {
    const { ctx, runId, s1, s2, s3 } = await setup();
    seedEdge(ctx, runId, s1, { to: s2 });
    const inferable = seedItem(ctx, runId, s3, linkJson(T), 5);
    const normal = seedItem(ctx, runId, s3, linkJson('https://shop.test/else'), 0);
    const next = await getNextFrontierItem(ctx, { run_id: runId });
    expect(next).toMatchObject({ item: { frontier_id: normal } });
    expect(frontierRow(ctx, inferable).status).toBe('done');
  });

  it('spec 026 F-04: a link to the same URL with another visible name is handed out, not inferred', async () => {
    const { ctx, runId, s1, s2, s3 } = await setup();
    seedEdge(ctx, runId, s1, { to: s2, name: 'Koszyk (0)' });
    const filled = seedItem(ctx, runId, s3, linkJson(T, { accessible_name: 'Koszyk (1)' }));
    const same = seedItem(ctx, runId, s3, linkJson(T, { accessible_name: 'Koszyk (0)' }));
    expect(await inferSameTarget(ctx, { ...rowOf(ctx, filled) })).toBe(false);
    expect(frontierRow(ctx, filled).status).toBe('pending');
    expect(await inferSameTarget(ctx, { ...rowOf(ctx, same) })).toBe(true);
    expect(frontierRow(ctx, same).status).toBe('done');
  });
});

function rowOf(ctx: Ctx, id: string) {
  return ctx.raw.prepare('SELECT * FROM frontier WHERE id = ?').get(id) as {
    id: string;
    run_id: string;
    state_id: string;
    action_id: string | null;
    action_json: string;
    safety_class: string;
  };
}
