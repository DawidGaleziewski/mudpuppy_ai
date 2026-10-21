import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { createBrowserRuntime, createServer } from '../src/index.js';
import { makeCtx } from './helpers.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';

// Spec 034 R-66: a run stores the way back to every state it reached (checkpoints); a focused run
// reaches a recorded screen by replaying it (`go_to_state`), explores only from there, and a hop
// that lands elsewhere stops the replay with REPLAY_DIVERGED.

const available = await canLaunchBrowser();

const portalYaml = (origin: string) => `
id: mock
base_url: ${origin}/
environment: sandbox
compliance: { robots_checked_on: null, terms_reviewed_on: null, terms_reviewed_by: null }
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 6
  max_states: 100
  max_actions_per_state: 50
  max_run_time_minutes: 5
  max_steps: 80
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (+ops@corp.pl)" }
item_route_templates: ["/oferta/:id"]
`;
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal();
});
afterAll(async () => portal?.close());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function setup() {
  const ctx = await makeCtx();
  ctx.dbEnvironment = 'sandbox';
  ctx.fetch = fetch;
  const put = (rel: string, c: string) => {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  };
  put('portals/mock/portal.yaml', portalYaml(portal.origin));
  put('personas/mock/guest.yaml', PERSONA);
  const runtime = createBrowserRuntime({
    stabilizer: { networkIdleMs: 150, domQuietMs: 100, timeoutMs: 5000, pollMs: 25 },
  });
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 'agent', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: { rationale: 'test', ...args } });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text) as Body,
    };
  };
  return { ctx, call, cleanup: () => runtime.closeAll() };
}

/** The first run: start page, the "oferty" link, then the second offer; returns the state ids. */
async function recordPath(call: Awaited<ReturnType<typeof setup>>['call']) {
  const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
    .run_id as string;
  const home = await call('navigate', { run_id: runId, url: `${portal.origin}/` });
  const toList = (home.body.actions as Body[]).find((x) => x.accessible_name === 'oferty')!;
  const list = await call('act', { run_id: runId, action_id: toList.action_id });
  const toItem = (list.body.actions as Body[]).find((x) => x.accessible_name === 'Laptop model 2')!;
  const item = await call('act', { run_id: runId, action_id: toItem.action_id });
  const direct = await call('navigate', { run_id: runId, url: `${portal.origin}/oferty/laptopy` });
  await call('finish_run', { run_id: runId, force: true });
  return {
    runId,
    home: home.body.state_id as string,
    list: list.body.state_id as string,
    item: item.body.state_id as string,
    laptops: direct.body.state_id as string,
  };
}

describe.skipIf(!available)('replay to a recorded screen (spec 034 R-66)', () => {
  it('stores checkpoints and replays the recorded path in a focused run', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const rec = await recordPath(call);
      const cp = await ctx.db
        .selectFrom('checkpoints')
        .selectAll()
        .where('run_id', '=', rec.runId)
        .where('state_id', '=', rec.item)
        .executeTakeFirstOrThrow();
      expect(cp.start_url).toBe(`${portal.origin}/`);
      expect(JSON.parse(cp.steps_json)).toHaveLength(2);

      const start = await call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        run_type: 'focused',
        plan: { start_state_ids: [rec.item], depth: 1 },
      });
      expect(start.isError).toBe(false);
      expect(start.body.start_points).toMatchObject([
        { state_id: rec.item, how: 'checkpoint', steps: 2 },
      ]);
      const runId = start.body.run_id as string;
      const run = await ctx.db
        .selectFrom('runs')
        .select(['run_type', 'plan_json'])
        .where('id', '=', runId)
        .executeTakeFirstOrThrow();
      expect(run.run_type).toBe('focused');

      const reached = await call('go_to_state', { run_id: runId, state_id: rec.item });
      expect(reached.isError).toBe(false);
      expect(reached.body).toMatchObject({
        state_id: rec.item,
        reached: { how: 'checkpoint', replayed_steps: 2 },
      });
      // The frontier starts at the target: nothing queued on the pages passed on the way.
      const queuedOn = await ctx.db
        .selectFrom('frontier')
        .select('state_id')
        .where('run_id', '=', runId)
        .execute();
      expect(queuedOn.length).toBeGreaterThan(0);
      expect(new Set(queuedOn.map((q) => q.state_id))).toEqual(new Set([rec.item]));
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('opens a state by URL only where a recorded visit did, and stops on a divergence', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const rec = await recordPath(call);
      const runId = (
        await call('start_run', {
          portal_id: 'mock',
          persona_id: 'guest',
          run_type: 'recheck',
          plan: { start_state_ids: [rec.laptops, rec.item] },
        })
      ).body.run_id as string;
      const direct = await call('go_to_state', { run_id: runId, state_id: rec.laptops });
      expect(direct.body.reached).toMatchObject({ how: 'deep_link', replayed_steps: 0 });

      // The recording now says the second hop leads to the start page: the page disagrees.
      await ctx.db
        .updateTable('checkpoints')
        .set({
          steps_json: JSON.stringify(
            (
              JSON.parse(
                (
                  await ctx.db
                    .selectFrom('checkpoints')
                    .select('steps_json')
                    .where('run_id', '=', rec.runId)
                    .where('state_id', '=', rec.item)
                    .executeTakeFirstOrThrow()
                ).steps_json,
              ) as { to_state: string }[]
            ).map((s, i) => (i === 1 ? { ...s, to_state: rec.home } : s)),
          ),
        })
        .where('run_id', '=', rec.runId)
        .where('state_id', '=', rec.item)
        .execute();
      const off = await call('go_to_state', { run_id: runId, state_id: rec.item });
      expect(off.isError).toBe(true);
      expect(off.body.error).toMatchObject({ code: 'REPLAY_DIVERGED', at_step: 2 });
      // A recheck queues nothing.
      const queued = await ctx.db
        .selectFrom('frontier')
        .select('id')
        .where('run_id', '=', runId)
        .where('status', '=', 'pending')
        .execute();
      expect(queued).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('retries one failed action, continues a stopped run, and leaves Skip marks out', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const rec = await recordPath(call);
      const toItem = await ctx.db
        .selectFrom('transitions')
        .select(['id', 'action_json'])
        .where('run_id', '=', rec.runId)
        .where('from_state', '=', rec.list)
        .where('to_state', '=', rec.item)
        .executeTakeFirstOrThrow();
      const pendingOf = (run: string) =>
        ctx.db
          .selectFrom('frontier as f')
          .innerJoin('actions as a', 'a.id', 'f.action_id')
          .select(['f.state_id', 'a.accessible_name'])
          .where('f.run_id', '=', run)
          .where('f.status', '=', 'pending')
          .execute();

      // Retry: only the failed action is queued on its page.
      const retry = await call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        run_type: 'retry',
        plan: { target_transition_id: toItem.id, variation: 'wait_longer' },
      });
      expect(retry.body.start_points).toMatchObject([{ state_id: rec.list }]);
      const retryId = retry.body.run_id as string;
      await call('go_to_state', { run_id: retryId, state_id: rec.list });
      expect(await pendingOf(retryId)).toEqual([
        { state_id: rec.list, accessible_name: 'Laptop model 2' },
      ]);
      await call('finish_run', { run_id: retryId });

      // Skip mark on that action: a continue run of the first run leaves it out, and does not
      // redo what the first run did.
      await ctx.db
        .insertInto('marks')
        .values({
          id: 'mk-skip',
          portal_id: 'mock',
          kind: 'skip',
          transition_id: toItem.id,
          created_by: 'owner',
          created_at: '2026-10-17T00:00:00.000Z',
          used_by_run_id: null,
          used_at: null,
        })
        .execute();
      const cont = await call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        run_type: 'continue',
        plan: { parent_run_id: rec.runId },
      });
      expect(cont.isError).toBe(false);
      const contId = cont.body.run_id as string;
      const starts = (cont.body.start_points as Body[]).map((p) => p.state_id as string);
      expect(starts).toContain(rec.list);
      await call('go_to_state', { run_id: contId, state_id: rec.list });
      const names = (await pendingOf(contId)).map((p) => p.accessible_name);
      expect(names).not.toContain('Laptop model 2'); // done by the first run, and Skip-marked
      expect(names).toContain('Laptop model 3'); // left pending by the first run: carried on
      const run = await ctx.db
        .selectFrom('runs')
        .select(['parent_run_id'])
        .where('id', '=', contId)
        .executeTakeFirstOrThrow();
      expect(run.parent_run_id).toBe(rec.runId);
    } finally {
      await cleanup();
    }
  }, 120_000);
});
