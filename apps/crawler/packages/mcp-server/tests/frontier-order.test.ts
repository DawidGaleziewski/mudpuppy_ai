import { describe, expect, it } from 'vitest';
import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../src/context.js';
import { getNextFrontierItem } from '../src/services/frontier.js';
import { tiersOf } from '../src/services/frontier-order.js';
import { makeCtx, REF, seedRun } from './helpers.js';

// Spec 026 (R-35, owner: "order only"): links to unvisited route templates first, then items
// without a link target, then links to visited templates; nothing is skipped.

const HOST = 'https://shop.test';
const url = (path: string) => `${HOST}${path}`;
const link = (path: string) =>
  JSON.stringify({ role: 'link', accessible_name: path, target_url: url(path) });
const button = JSON.stringify({ role: 'button', accessible_name: 'Zamawiam' });
/** Twelve product slugs: more than the templater's ten, so `/sklep/produkt/:param` forms. */
const SLUGS = Array.from({ length: 12 }, (_, i) => `kalosze-model-${String.fromCharCode(97 + i)}`);

function seedVisit(ctx: ServerContext, runId: string, path: string): string {
  const id = newId();
  const ts = nowIso();
  ctx.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title,
         evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, 'shop', ?, ?, ?, ?, ?, 'observed', 'settled', ?, ?)`,
    )
    .run(id, id.padEnd(64, '0').slice(0, 64), id, path, path, REF, runId, ts);
  ctx.raw
    .prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, created_at)
       VALUES (?, ?, ?, NULL, 'navigate', ?, ?)`,
    )
    .run(newId(), runId, id, url(path), ts);
  return id;
}

function seedItem(
  ctx: ServerContext,
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
         allowed, skip_reason, created_at) VALUES (?, ?, ?, 'link', 'x', ?, 'read', 1, NULL, ?)`,
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

/** The F-17 shape: the catalogue and one product visited, the other products queued. */
async function catalogue() {
  const ctx = await makeCtx();
  const runId = await seedRun(ctx);
  const home = seedVisit(ctx, runId, '/sklep');
  seedVisit(ctx, runId, `/sklep/produkt/${SLUGS[0]}`);
  const products = SLUGS.slice(1).map((s) =>
    seedItem(ctx, runId, home, link(`/sklep/produkt/${s}`), 5),
  );
  return { ctx, runId, home, products };
}

const pick = async (ctx: ServerContext, runId: string) =>
  (await getNextFrontierItem(ctx, { run_id: runId })).item?.frontier_id;

const settle = (ctx: ServerContext, id: string | undefined) =>
  ctx.raw.prepare(`UPDATE frontier SET status = 'done' WHERE id = ?`).run(id);

describe('tiersOf', () => {
  const row = (json: string) => ({ action_id: 'a', action_json: json });
  const visited = [url('/sklep'), url(`/sklep/produkt/${SLUGS[0]}`)];

  it('ranks unvisited-template links 0, items without a link target 1, visited-template links 2', () => {
    const products = SLUGS.slice(1).map((s) => row(link(`/sklep/produkt/${s}`)));
    const tiers = tiersOf(
      [row(link('/sklep/koszyk')), row(button), row(link('/sklep?strona=3')), ...products],
      visited,
    );
    expect(tiers.slice(0, 3)).toEqual([0, 1, 2]);
    // the queued products collapse into the visited product template, not a template each
    expect(new Set(tiers.slice(3))).toEqual(new Set([2]));
  });
});

describe('getNextFrontierItem frontier order (spec 026)', () => {
  it('hands out the unvisited-template link, then buttons, then product and page links', async () => {
    const { ctx, runId, home, products } = await catalogue();
    const page = seedItem(ctx, runId, home, link('/sklep?strona=2'), 5);
    const pay = seedItem(ctx, runId, home, button);
    const cart = seedItem(ctx, runId, home, link('/sklep/koszyk'), -20);
    const order: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await pick(ctx, runId);
      order.push(id);
      settle(ctx, id);
    }
    // within tier 2 the old order holds: priority, then the oldest id
    expect(order).toEqual([cart, pay, products[0]]);
    expect(page).toBeDefined();
  });

  it('skips nothing: when only visited-template links are pending they are still handed out (FR-005)', async () => {
    const { ctx, runId, products } = await catalogue();
    for (const expected of products) {
      const id = await pick(ctx, runId);
      expect(id).toBe(expected);
      settle(ctx, id);
    }
    expect(await pick(ctx, runId)).toBeUndefined();
  });
});
