import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { createBrowserRuntime, createServer, interruptStaleRuns } from '../src/index.js';
import { makeCtx } from './helpers.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';

const available = await canLaunchBrowser();

const UA = 'PathfinderAI-Crawler/0.1 (+ops@corp.pl)';
const RPS = 20;

const portalYaml = (o: {
  origin: string;
  env?: string;
  base?: string;
  ua?: string;
  compliance?: boolean;
}) => `
id: mock
base_url: ${o.base ?? o.origin + '/'}
environment: ${o.env ?? 'sandbox'}
compliance:
  robots_checked_on: ${o.compliance ? '2026-09-20' : 'null'}
  terms_reviewed_on: ${o.compliance ? '2026-09-21' : 'null'}
  terms_reviewed_by: ${o.compliance ? 'me' : 'null'}
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: 6
  max_states: 100
  max_actions_per_state: 50
  max_run_time_minutes: 5
  max_steps: 80
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact, "path:/oferty/wystaw/*"]
obstacles:
  - { id: cookie_banner, selector: "#cookie button.accept" }
rate_limit: { requests_per_second: ${RPS}, max_concurrency: 1, user_agent: "${o.ua ?? UA}" }
item_view_cap: 2
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

async function setup(files: { portal?: string } = {}) {
  const ctx = await makeCtx();
  ctx.dbEnvironment = 'sandbox';
  ctx.fetch = fetch; // the mock portal serves its own robots.txt on localhost
  const put = (rel: string, c: string) => {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  };
  put('portals/mock/portal.yaml', files.portal ?? portalYaml({ origin: portal.origin }));
  put('personas/mock/guest.yaml', PERSONA);
  const runtime = createBrowserRuntime({
    stabilizer: { networkIdleMs: 150, domQuietMs: 100, timeoutMs: 5000, pollMs: 25 },
  });
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 'agent', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError: boolean; body: Body }> => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  return { ctx, runtime, call, cleanup: () => runtime.closeAll() };
}

/** The agent loop: follow the server's frontier until it is empty. */
async function crawl(
  call: Awaited<ReturnType<typeof setup>>['call'],
  runId: string,
  maxSteps = 60,
): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const next = await call('get_next_frontier_item', { run_id: runId });
    if (next.isError || !next.body.item) return;
    await call('act', { run_id: runId, action_id: next.body.item.action_id });
  }
}

describe.skipIf(!available)('map run against the mock portal', () => {
  it('maps the portal read-only, with evidence and confidence on every record', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
      expect(start).toMatchObject({
        isError: false,
        body: { resumed: false, effective_max_action_class: 'read' },
      });
      const runId = start.body.run_id as string;

      const home = await call('navigate', { run_id: runId, url: portal.origin + '/' });
      expect(home.isError).toBe(false);
      expect(home.body.actions.length).toBeGreaterThan(5);
      await crawl(call, runId);
      const fin = await call('finish_run', { run_id: runId });
      expect(fin).toMatchObject({ isError: false, body: { status: 'completed' } });

      const states = await ctx.db.selectFrom('states').selectAll().execute();
      const edges = await ctx.db.selectFrom('edges').selectAll().execute();
      const forms = await ctx.db.selectFrom('forms').selectAll().execute();
      expect(states.length).toBeGreaterThan(3);
      expect(edges.length).toBeGreaterThan(3);
      expect(forms.length).toBeGreaterThan(0);
      // SC-003: every state/edge/form carries evidence_ref and confidence
      for (const r of [...states, ...edges, ...forms]) {
        expect(r.evidence_ref).toMatch(/^[0-9a-f]{64}\.yaml$/);
        expect(r.confidence).toBeTruthy();
      }
      // evidence files exist on disk
      const files = readdirSync(join(ctx.dir, 'evidence'));
      expect(files.length).toBeGreaterThan(0);
      for (const r of states) expect(files).toContain(r.evidence_ref);
      // SC-002: everything executed is read
      expect(
        edges.filter((e) => e.status === 'executed').every((e) => e.safety_class === 'read'),
      ).toBe(true);
      // the seller's PII from the API response is never stored
      const calls = await ctx.db.selectFrom('network_calls').selectAll().execute();
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls)).not.toMatch(/jan\.kowalski|601 234/);
      expect(calls.some((c) => c.url_template === '/api/offers/:param')).toBe(true);
      // forms recorded, never submitted
      expect(portal.requests.filter((r) => r.method === 'POST')).toEqual([]);
      const form = JSON.parse(forms.find((f) => f.fields_json.includes('body'))!.fields_json);
      expect(form[0]).toMatchObject({ name: 'body', type: 'textarea', required: true });
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('clusters the duplicate listing, and lists mutating buttons in the frontier as skipped', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      const a = await call('navigate', { run_id: runId, url: portal.origin + '/oferty' });
      const b = await call('navigate', { run_id: runId, url: portal.origin + '/oferty/laptopy' });
      expect(a.body.state_id).not.toBe(b.body.state_id);
      expect(b.body.cluster_id).toBe(a.body.cluster_id);
      const decisions = await ctx.db.selectFrom('decision_log').select(['kind', 'rule']).execute();
      expect(
        decisions.some((d) => d.kind === 'merge' && d.rule === 'fingerprint:similar-structure'),
      ).toBe(true);

      const item = await call('navigate', { run_id: runId, url: portal.origin + '/oferta/1' });
      const byName = Object.fromEntries(item.body.actions.map((x: Body) => [x.accessible_name, x]));
      for (const name of ['Licytuj', 'Kup teraz', 'Pokaż numer telefonu']) {
        expect(byName[name]).toMatchObject({ allowed: false });
      }
      expect(byName['Dodaj do ulubionych']).toMatchObject({
        allowed: false,
        safety_class: 'mutating',
      });
      const skipped = await ctx.db
        .selectFrom('frontier')
        .select(['status', 'reason', 'action_json'])
        .where('state_id', '=', item.body.state_id)
        .execute();
      const status = (n: string) => skipped.find((s) => s.action_json.includes(n))?.status;
      expect(status('Licytuj')).toBe('denylisted');
      expect(status('Kup teraz')).toBe('denylisted');
      expect(status('Dodaj do ulubionych')).toBe('skipped_unsafe');
      expect(skipped.every((s) => s.status === 'pending' || !!s.reason)).toBe(true);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('rejects an act with an unissued action_id, never executes a denylisted action', async () => {
    const { call, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      const item = await call('navigate', { run_id: runId, url: portal.origin + '/oferta/1' });
      expect((await call('act', { run_id: runId, action_id: 'made-up-id' })).body.error.code).toBe(
        'UNKNOWN_ACTION',
      );
      const bid = item.body.actions.find((x: Body) => x.accessible_name === 'Licytuj');
      const r = await call('act', { run_id: runId, action_id: bid.action_id });
      expect(r).toMatchObject({
        isError: true,
        body: { error: { code: 'ACTION_REFUSED', rule: 'bidding→purchase' } },
      });
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('refuses start_run before any request: undeclared production address, null compliance, placeholder User-Agent', async () => {
    const before = portal.requests.length;
    const cases: string[] = [
      portalYaml({ origin: portal.origin, base: 'https://shop.example-portal.pl/' }).replace(
        'allowed_domains: [127.0.0.1]',
        'allowed_domains: [shop.example-portal.pl]',
      ),
      portalYaml({ origin: portal.origin, env: 'production', compliance: false })
        .replace('allowed_domains: [127.0.0.1]', 'allowed_domains: [shop.example-portal.pl]')
        .replace(portal.origin + '/', 'https://shop.example-portal.pl/'),
      portalYaml({
        origin: portal.origin,
        ua: 'Bot (+contact@example.com)',
        compliance: true,
      }).replace('environment: sandbox', 'environment: production'),
    ];
    for (const yaml of cases) {
      const { call, cleanup } = await setup({ portal: yaml });
      const t0 = Date.now();
      const r = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
      expect(r).toMatchObject({ isError: true, body: { error: { code: 'ENV_GUARD_REFUSED' } } });
      expect(Date.now() - t0).toBeLessThan(5000);
      await cleanup();
    }
    expect(portal.requests.length).toBe(before);
  }, 60_000);

  it('refuses navigate to a logout URL and never requests it', async () => {
    const { call, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      await call('navigate', { run_id: runId, url: portal.origin + '/' });
      const before = portal.hits('/wyloguj').length;
      const r = await call('navigate', { run_id: runId, url: portal.origin + '/wyloguj' });
      expect(r).toMatchObject({
        isError: true,
        body: { error: { code: 'ACTION_REFUSED', rule: 'logout' } },
      });
      const wystaw = await call('navigate', {
        run_id: runId,
        url: portal.origin + '/oferty/wystaw/nowa',
      });
      expect(wystaw.body.error).toMatchObject({
        code: 'ACTION_REFUSED',
        rule: 'path:/oferty/wystaw/*',
      });
      const ext = await call('navigate', { run_id: runId, url: 'http://ads.invalid/promo' });
      expect(ext.body.error).toMatchObject({ code: 'ACTION_REFUSED', rule: 'scope:domain' });
      expect(portal.hits('/wyloguj').length).toBe(before);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('sends the configured User-Agent on every request and respects the rate limit', async () => {
    const { call, cleanup } = await setup();
    const from = portal.requests.length;
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      await call('navigate', { run_id: runId, url: portal.origin + '/' });
      await call('navigate', { run_id: runId, url: portal.origin + '/oferty' });
      await call('navigate', { run_id: runId, url: portal.origin + '/oferta/2' });
      const mine = portal.requests.slice(from);
      expect(mine.length).toBeGreaterThanOrEqual(4);
      expect(mine.every((r) => r.userAgent === UA)).toBe(true);
      const gaps = mine.slice(1).map((r, i) => r.at - mine[i]!.at);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual((1000 / RPS) * 0.6);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('stops on a 403: stopped_warning, zero further requests, RUN_STOPPED on every later call (SC-007)', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      const home = await call('navigate', { run_id: runId, url: portal.origin + '/' });
      const first = await call('get_next_frontier_item', { run_id: runId });
      expect(first.body.item).toBeTruthy();

      const blocked = await call('navigate', { run_id: runId, url: portal.origin + '/blocked' });
      expect(blocked).toMatchObject({ isError: true, body: { error: { code: 'RUN_STOPPED' } } });
      const run = await ctx.db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirstOrThrow();
      expect(run.status).toBe('stopped_warning');
      expect(run.warning).toContain('403');
      expect(
        await ctx.db
          .selectFrom('decision_log')
          .select('rule')
          .where('kind', '=', 'warning')
          .execute(),
      ).toContainEqual({ rule: 'block_detected' });

      const count = portal.requests.length;
      for (let i = 0; i < 3; i++) {
        for (const [tool, args] of [
          ['navigate', { run_id: runId, url: portal.origin + '/oferty' }],
          ['act', { run_id: runId, action_id: home.body.actions[0].action_id }],
          ['get_next_frontier_item', { run_id: runId }],
          ['add_open_question', { run_id: runId, text: 'x', about_ref: home.body.state_id }],
        ] as const) {
          expect((await call(tool, args)).body.error.code).toBe('RUN_STOPPED');
        }
      }
      expect(portal.requests.length).toBe(count);
      // there is no way to resume past a block
      const resume = await call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        resume_run_id: runId,
      });
      expect(resume.body.error.code).toBe('RUN_NOT_RESUMABLE');
      expect(portal.requests.length).toBe(count);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('interrupt + resume_run_id continues from the persisted frontier without duplicating states or edges (SC-010)', async () => {
    const { ctx, call, runtime, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      await call('navigate', { run_id: runId, url: portal.origin + '/' });
      for (let i = 0; i < 4; i++) {
        const next = await call('get_next_frontier_item', { run_id: runId });
        await call('act', { run_id: runId, action_id: next.body.item.action_id });
      }
      const edgesBefore = await ctx.db.selectFrom('edges').select('id').execute();
      const statesBefore = await ctx.db.selectFrom('states').select('id').execute();
      const pendingBefore = await ctx.db
        .selectFrom('frontier')
        .select('id')
        .where('status', '=', 'pending')
        .execute();
      expect(edgesBefore.length).toBe(4);

      // crash: the browser is gone, the server restarts and marks the run interrupted
      await runtime.closeAll();
      expect(await interruptStaleRuns(ctx)).toEqual([runId]);
      expect((await call('get_next_frontier_item', { run_id: runId })).body.error.code).toBe(
        'RUN_STOPPED',
      );

      const resumed = await call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        resume_run_id: runId,
      });
      expect(resumed.body).toMatchObject({ run_id: runId, resumed: true });
      expect(
        (await ctx.db.selectFrom('runs').select('steps_used').executeTakeFirstOrThrow()).steps_used,
      ).toBe(5);
      // nothing was re-recorded by resuming
      expect((await ctx.db.selectFrom('edges').select('id').execute()).length).toBe(
        edgesBefore.length,
      );
      expect(
        (await ctx.db.selectFrom('frontier').select('id').where('status', '=', 'pending').execute())
          .length,
      ).toBe(pendingBefore.length);

      await crawl(call, runId);
      expect((await call('finish_run', { run_id: runId })).body.status).toBe('completed');

      const edges = await ctx.db.selectFrom('edges').selectAll().execute();
      const keys = edges.map((e) => `${e.from_state}|${e.action_json}`);
      expect(new Set(keys).size).toBe(keys.length); // no duplicate edge for the same action in the same state
      for (const e of edgesBefore) expect(edges.map((x) => x.id)).toContain(e.id);
      const states = await ctx.db.selectFrom('states').selectAll().execute();
      expect(new Set(states.map((s) => s.fingerprint)).size).toBe(states.length);
      for (const s of statesBefore) expect(states.map((x) => x.id)).toContain(s.id);
      expect(edges.length).toBeGreaterThan(edgesBefore.length);
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('records ranked locators including data-testid and a snapshot reference on every transition (SC-009)', async () => {
    const { ctx, call, cleanup } = await setup();
    try {
      const runId = (await call('start_run', { portal_id: 'mock', persona_id: 'guest' })).body
        .run_id as string;
      const item = await call('navigate', { run_id: runId, url: portal.origin + '/oferta/1' });
      const act = (name: string) =>
        item.body.actions.find((x: Body) => x.accessible_name === name).action_id as string;

      expect((await call('act', { run_id: runId, action_id: act('Wróć do listy') })).isError).toBe(
        false,
      );
      await call('act', { run_id: runId, action_id: act('Licytuj') }); // refused, still recorded as a skipped transition

      const edges = await ctx.db.selectFrom('edges').selectAll().execute();
      const byName = (name: string) =>
        JSON.parse(edges.find((e) => e.action_json.includes(name))!.action_json);
      const back = byName('Wróć do listy');
      expect(back.locators.map((l: Body) => l.kind)).toEqual([
        'role',
        'text',
        'test_id',
        'container',
      ]);
      expect(back.locators.find((l: Body) => l.kind === 'test_id')).toMatchObject({
        value: 'back-to-list',
        rank: 2,
      });
      expect(back.locators[0]).toMatchObject({
        kind: 'role',
        value: 'role=link[name="Wróć do listy"]',
        rank: 0,
      });
      const bid = byName('Licytuj');
      expect(bid.locators.find((l: Body) => l.kind === 'test_id')?.value).toBe('bid-btn');

      // every transition carries at least one locator and a reference to the snapshot it came from
      const files = readdirSync(join(ctx.dir, 'evidence'));
      for (const e of edges) {
        const a = JSON.parse(e.action_json);
        expect(a.locators.length).toBeGreaterThan(0);
        expect(a.locators.every((l: Body, i: number) => l.rank === i)).toBe(true);
        expect(files).toContain(a.snapshot_ref);
      }
      // an element without a data-testid still gets role/text/container candidates
      const noId = JSON.parse(edges[0]!.action_json).locators.map((l: Body) => l.kind);
      expect(noId).toEqual(expect.arrayContaining(['role', 'container']));
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('makes no HTTP calls of its own (FR-025)', () => {
    const roots = ['../../mcp-server/src', '../../crawler/src'].map((p) =>
      fileURLToPath(new URL(p, import.meta.url)),
    );
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    roots.forEach(walk);
    const forbidden = [
      /\bfetch\s*\(/,
      /from ['"](node:)?https?['"]/,
      /require\(['"](node:)?https?['"]\)/,
      /\bundici\b/,
      /\baxios\b/,
      /\bXMLHttpRequest\b/,
      /from ['"]node-fetch['"]/,
      /from ['"](node:)?net['"]/,
      /\.request\(\s*\{/,
    ];
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        // Spec 002 exceptions, both deliberate: the request gate fetches the browser's own main-frame
        // navigation without following redirects (FR-003), and the robots registry reads only
        // `/robots.txt` (FR-001). Neither calls the operator's APIs.
        .replace(/\(route as Route\)\.fetch\(/g, '');
      if (f.endsWith('robots-registry.ts')) {
        expect(text).toMatch(/`\$\{origin\}\/robots\.txt`/);
        continue;
      }
      for (const re of forbidden) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
    expect(files.length).toBeGreaterThan(10);
  });
});
