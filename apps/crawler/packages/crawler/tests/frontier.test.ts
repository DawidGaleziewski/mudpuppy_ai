import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateUp, newId, nowIso, openDb, type OpenedDb } from '@pathfinder/core';
import { builtinRuleSet } from '@pathfinder/safety';
import { classifyCandidates, extractCandidates } from '../src/action-extractor.js';
import type { GateContext } from '../src/action-gate.js';
import {
  FrontierPolicy,
  enqueueActions,
  pendingItemForAction,
  settleFrontierItem,
} from '../src/frontier.js';
import { buildFrontierReport, computeCoverage, renderReport } from '../src/report.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
let opened: OpenedDb | undefined;
afterEach(async () => opened?.close());

async function db() {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const ts = nowIso();
  const runId = newId();
  await opened.db
    .insertInto('runs')
    .values({
      id: runId,
      portal_id: 'p',
      persona_id: 'g',
      mode: 'map',
      environment: 'production',
      env_version_or_date: 'd',
      seed_id: null,
      viewport: 'v',
      locale: 'l',
      browser: 'c',
      config_snapshot: '{}',
      status: 'running',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: ts,
      ended_at: null,
      coverage: null,
    })
    .execute();
  return { db: opened.db, runId, ts };
}
async function addState(d: Awaited<ReturnType<typeof db>>, fp: string, template = '/x') {
  const id = newId();
  await d.db
    .insertInto('states')
    .values({
      id,
      portal_id: 'p',
      fingerprint: fp.repeat(64).slice(0, 64),
      cluster_id: 'c',
      route_template: template,
      title: 't',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      confidence: 'observed',
      stabilization: 'settled',
      first_seen_run: d.runId,
      created_at: d.ts,
    })
    .execute();
  await d.db
    .insertInto('state_observations')
    .values({
      run_id: d.runId,
      state_id: id,
      persona_id: 'g',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      observed_at: d.ts,
    })
    .execute();
  return id;
}

const gate = (over: Partial<GateContext> = {}): GateContext => ({
  scope: {
    allowed_domains: ['shop.pl'],
    allowed_paths: ['/*'],
    external_link_policy: 'record',
    max_depth: 6,
    max_states: 500,
    max_actions_per_state: 20,
    max_run_time_minutes: 60,
    max_steps: 2000,
  },
  denylist: ['bidding', 'buy_now', 'logout', 'reveal_seller_contact'],
  rules: builtinRuleSet(),
  robots: { check: () => ({ state: 'allowed', rule: null }) },
  effectiveMaxActionClass: 'read',
  usage: { depth: 1, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 },
  ...over,
});

describe('FrontierPolicy', () => {
  it('stops a same-cluster branch after N appearances within the window', () => {
    const p = new FrontierPolicy({ windowSize: 10, maxSameClusterInWindow: 3 });
    const r = Array.from({ length: 5 }, () =>
      p.admit({ clusterId: 'listing', routeTemplate: '/oferty', created: true }),
    );
    expect(r.map((x) => x.expand)).toEqual([true, true, true, false, false]);
    expect(r[3]).toMatchObject({ status: 'budget_reached', rule: 'cap:same_cluster' });
    expect(p.admit({ clusterId: 'other', routeTemplate: '/x', created: true }).expand).toBe(true);
  });

  it('forgets clusters that fall out of the sliding window', () => {
    const p = new FrontierPolicy({ windowSize: 3, maxSameClusterInWindow: 2 });
    p.admit({ clusterId: 'a', routeTemplate: '/1', created: true });
    p.admit({ clusterId: 'a', routeTemplate: '/2', created: true });
    for (const c of ['b', 'c', 'd'])
      p.admit({ clusterId: c, routeTemplate: `/${c}`, created: true });
    expect(p.admit({ clusterId: 'a', routeTemplate: '/3', created: true }).expand).toBe(true);
  });

  it('caps states per route template', () => {
    const p = new FrontierPolicy({ maxPerTemplate: 2, maxSameClusterInWindow: 99 });
    const r = ['1', '2', '3'].map((c) =>
      p.admit({ clusterId: c, routeTemplate: '/oferta/:id', created: true }),
    );
    expect(r[2]).toMatchObject({ expand: false, rule: 'cap:per_template' });
  });

  it('is BFS with a novelty boost', () => {
    const p = new FrontierPolicy();
    expect(p.priorityFor(1, false)).toBeGreaterThan(p.priorityFor(2, true));
    expect(p.priorityFor(2, true)).toBeGreaterThan(p.priorityFor(2, false));
    p.admit({ clusterId: 'x', routeTemplate: '/', created: true });
    expect(p.isNewCluster('x')).toBe(false);
    expect(p.isNewCluster('y')).toBe(true);
  });

  it('enforces item_view_cap on item route templates only, counting item pages this run', async () => {
    const d = await db();
    const p = new FrontierPolicy({ itemViewCap: 2, itemRouteTemplates: ['/oferta/:id'] });
    expect(await p.checkItemCap(d.db, d.runId, '/oferta/:id')).toBeNull();
    await addState(d, 'a', '/oferta/:id');
    await addState(d, 'b', '/oferta/:id');
    await addState(d, 'c', '/oferty');
    expect(await p.checkItemCap(d.db, d.runId, '/oferta/:id')).toMatchObject({
      status: 'budget_reached',
      rule: 'cap:item_view_cap',
    });
    expect(await p.checkItemCap(d.db, d.runId, '/oferty')).toBeNull();
  });

  it('restores its window after a resume', () => {
    const p = new FrontierPolicy({ maxSameClusterInWindow: 2 });
    p.restore([
      { clusterId: 'a', routeTemplate: '/1' },
      { clusterId: 'a', routeTemplate: '/2' },
    ]);
    expect(p.admit({ clusterId: 'a', routeTemplate: '/3', created: false }).expand).toBe(false);
  });
});

describe('enqueueActions + report', () => {
  const snap = [
    '- main:',
    '    - link "Moda":',
    '        - /url: /oferty/moda',
    '    - button "Licytuj"',
    '    - button "Pokaż numer telefonu"',
    '    - link "Wyloguj":',
    '        - /url: /wyloguj',
    '    - link "Reklama":',
    '        - /url: https://ads.example/x',
    '    - button "Dodaj do ulubionych"',
  ].join('\n');

  async function enqueue(d: Awaited<ReturnType<typeof db>>, stateId: string, g = gate()) {
    const actions = classifyCandidates(extractCandidates(snap), builtinRuleSet()).map((a) => ({
      ...a,
      actionId: newId(),
      actionJson: { role: a.role, accessible_name: a.name },
    }));
    for (const a of actions) {
      await d.db
        .insertInto('actions')
        .values({
          id: a.actionId,
          run_id: d.runId,
          state_id: stateId,
          role: a.role,
          accessible_name: a.name,
          action_json: '{}',
          safety_class: a.safetyClass,
          allowed: 1,
          skip_reason: null,
          created_at: d.ts,
        })
        .execute();
    }
    return enqueueActions({
      db: d.db,
      runId: d.runId,
      stateId,
      depth: 1,
      priority: 0,
      currentUrl: 'https://shop.pl/oferty',
      actions,
      gate: g,
    });
  }

  it('queues read actions as pending and records every refusal with its rule', async () => {
    const d = await db();
    const s = await addState(d, 'a');
    const r = await enqueue(d, s);
    expect(r.queued).toBe(1);
    const rows = await d.db
      .selectFrom('frontier')
      .select(['status', 'safety_class', 'reason'])
      .orderBy('id')
      .execute();
    const byStatus = Object.fromEntries(rows.map((x) => [x.status, x]));
    expect(byStatus.pending).toBeDefined();
    expect(
      rows
        .filter((x) => x.status === 'denylisted')
        .map((x) => x.reason?.split(':')[0])
        .sort(),
    ).toEqual(['bidding→purchase', 'logout', 'reveal_seller_contact→reveal_contact']);
    expect(rows.find((x) => x.status === 'out_of_scope')!.reason).toContain('scope:domain');
    expect(rows.find((x) => x.status === 'skipped_unsafe')!.reason).toContain('ceiling:read');
    expect(rows.every((x) => x.status === 'pending' || x.status === 'done' || !!x.reason)).toBe(
      true,
    );
  });

  it('hands the pending item to act and settles it', async () => {
    const d = await db();
    const s = await addState(d, 'a');
    await enqueue(d, s);
    const pending = await d.db
      .selectFrom('frontier')
      .selectAll()
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    expect((await pendingItemForAction(d.db, d.runId, pending.action_id!))?.id).toBe(pending.id);
    await settleFrontierItem(d.db, pending.id, 'done', null);
    expect(await pendingItemForAction(d.db, d.runId, pending.action_id!)).toBeUndefined();
  });

  it('report lists every skipped action with class and reason, coverage and item visits', async () => {
    const d = await db();
    const s = await addState(d, 'a', '/oferta/:id');
    await enqueue(d, s);
    const rep = await buildFrontierReport(d.db, d.runId, ['/oferta/:id']);
    expect(rep.skipped).toHaveLength(5);
    expect(rep.pending).toBe(1);
    expect(rep.coverage).toMatchObject({ states: 1, actions_executed: 0, item_page_visits: 1 });
    expect(rep.coverage.actions_skipped_by_class).toMatchObject({
      'external-side-effect': 2,
      destructive: 1,
    });
    const text = renderReport(rep);
    expect(text).toContain('[denylisted] external-side-effect: button "Licytuj"');
    expect(text).toContain('[out of scope]');
    expect(text).toContain('[not read-only] mutating');
    expect(text).toContain('Item pages visited: 1');
    expect((await computeCoverage(d.db, d.runId)).item_page_visits).toBe(0);
  });
});
