import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startHarness, type Body, type Call } from './harness.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';

/**
 * Spec 080 (R-35 F-17@015, R-58 batch drain): the list cap and `drain_frontier` on the mock
 * auction portal, whose offers `/oferta/1` … `/oferta/6` are one screen with other data.
 */
const available = await canLaunchBrowser();

const portalYaml = (origin: string, cap: string) => `
id: mock
base_url: ${origin}/
environment: sandbox
compliance:
  robots_checked_on: 2026-09-20
  terms_reviewed_on: 2026-09-21
  terms_reviewed_by: me
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 6
  max_states: 100
  max_actions_per_state: 50
  max_run_time_minutes: 5
  max_steps: 120
${cap}
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact]
obstacles:
  - { id: cookie_banner, selector: "#cookie button.accept" }
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (+ops@corp.pl)" }
`;
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal();
});
afterAll(async () => portal?.close());

async function setUp(cap = '') {
  return startHarness({
    'portals/mock/portal.yaml': portalYaml(portal.origin, cap),
    'personas/mock/guest.yaml': PERSONA,
  });
}

async function startAt(call: Call, origin: string): Promise<string> {
  const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  if (start.isError) throw new Error(JSON.stringify(start.body));
  const run = start.body.run_id as string;
  await call('navigate', { run_id: run, url: `${origin}/`, rationale: 'start' });
  return run;
}

/** Act on the next item until none is left; with `drain`, let the server take the repetitive ones. */
async function explore(call: Call, run: string, drain: boolean): Promise<Body[]> {
  const drains: Body[] = [];
  for (let i = 0; i < 200; i++) {
    if (drain) {
      const d = await call('drain_frontier', { run_id: run, rationale: 'repetitive links' });
      if (d.isError) throw new Error(JSON.stringify(d.body));
      drains.push(d.body);
      if (d.body.next === null) return drains;
    }
    const next = await call('get_next_frontier_item', { run_id: run });
    if (next.isError || !next.body.item) return drains;
    await call('act', { run_id: run, action_id: next.body.item.action_id, rationale: 'next' });
  }
  return drains;
}

describe.skipIf(!available)('the frontier on a list of items (spec 080)', () => {
  it('stops opening offers once two showed the same screen (list cap)', async () => {
    const h = await setUp('  max_items_per_template: 2');
    try {
      const run = await startAt(h.call, portal.origin);
      await explore(h.call, run, false);
      const raw = h.ctx.raw;
      const offers = raw
        .prepare(
          "SELECT DISTINCT url, state_id FROM observations WHERE run_id = ? AND url LIKE '%/oferta/%'",
        )
        .all(run) as { url: string; state_id: string }[];
      expect(new Set(offers.map((o) => o.state_id)).size).toBe(1);
      expect(offers.length).toBe(2);
      const capped = raw
        .prepare(
          "SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'budget_reached' AND reason LIKE 'list_cap:%'",
        )
        .get(run) as { n: number };
      expect(capped.n).toBeGreaterThan(0);
      const fin = await h.call('finish_run', { run_id: run, rationale: 'done' });
      expect(fin.isError, JSON.stringify(fin.body)).toBe(false);
    } finally {
      await h.cleanup();
    }
  }, 180_000);

  it('drain_frontier acts on repetitive links in one call and hands back the rest', async () => {
    const h = await setUp('  max_items_per_template: 50');
    try {
      const run = await startAt(h.call, portal.origin);
      const drains = await explore(h.call, run, true);
      const drained = drains.flatMap((d) => d.drained as Body[]);
      expect(drained.length).toBeGreaterThan(0);
      expect(drains.map((d) => d.stopped)).toContain('not_drainable');
      // Every drained item was recorded like an act: an executed transition from its state.
      const executed = h.ctx.raw
        .prepare("SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'done'")
        .get(run) as { n: number };
      expect(executed.n).toBeGreaterThanOrEqual(drained.length);
      const fin = await h.call('finish_run', { run_id: run, rationale: 'done' });
      expect(fin.isError, JSON.stringify(fin.body)).toBe(false);
    } finally {
      await h.cleanup();
    }
  }, 180_000);
});
