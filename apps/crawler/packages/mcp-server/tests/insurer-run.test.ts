import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditPii } from '@pathfinder/core';
import { buildFrontierReport, canLaunchBrowser, renderReport } from '@pathfinder/crawler';
import { interruptStaleRuns } from '../src/index.js';
import { crawl, mapPortal, startHarness, type Body } from './harness.js';
import { startMockInsurer, type MockInsurerOptions } from './mock-insurer.js';
import type { MockPortal } from './mock-portal.js';

const available = await canLaunchBrowser();

/** Written by the test: the insurer mock is onboarded with configuration only (SC-004). */
const insurerYaml = (
  origin: string,
  o: { pageRequests?: 'block' | 'allow_and_record'; denylist?: string; extra?: string } = {},
) => `
id: insurer
base_url: ${origin}/
environment: sandbox
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: 4
  max_states: 40
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 60
denylist: ${o.denylist ?? '[logout, delete, payment, purchase, submit_request, contact_or_message, reveal_contact]'}
obstacles:
  - { id: cookie_dialog, selector: "#CybotCookiebotDialogBodyButtonDecline" }
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (+ops@corp.pl)" }
robots_page_requests: ${o.pageRequests ?? 'block'}
${o.extra ?? ''}`;
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const mocks: MockPortal[] = [];
afterEach(async () => {
  for (const m of mocks.splice(0)) await m.close();
});

async function insurer(
  opts: MockInsurerOptions = {},
  yaml: Parameters<typeof insurerYaml>[1] = {},
) {
  const mock = await startMockInsurer(opts);
  mocks.push(mock);
  const h = await startHarness({
    'portals/insurer/portal.yaml': insurerYaml(mock.origin, yaml),
    'personas/insurer/guest.yaml': PERSONA,
  });
  return { mock, ...h };
}

const DISALLOWED = [/cHash/, /^\/quote\/(?!start)/, /^\/api\//];

describe.skipIf(!available)('insurer mock: robots.txt (spec 002 US1, SC-001, SC-003)', () => {
  it('5 consecutive map runs never request a robots-disallowed URL', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runIds: string[] = [];
      for (let i = 0; i < 5; i++) runIds.push(await mapPortal(call, 'insurer', mock.origin + '/'));

      const offending = mock.requests.filter((r) => DISALLOWED.some((re) => re.test(r.url)));
      expect(offending).toEqual([]);
      expect(mock.hits('/quote/start').length).toBeGreaterThan(0);
      expect(mock.hits('/robots.txt').length).toBe(5); // once per run

      for (const runId of runIds) {
        const skipped = await ctx.db
          .selectFrom('frontier')
          .select(['status', 'reason', 'action_json'])
          .where('run_id', '=', runId)
          .where('status', '=', 'robots_disallowed')
          .execute();
        const reasons = skipped.map((s) => s.reason ?? '');
        expect(reasons.some((r) => r.startsWith('robots:Disallow: *cHash*'))).toBe(true);
        expect(reasons.some((r) => r.startsWith('robots:Disallow: /quote/'))).toBe(true);

        const refusals = await ctx.db
          .selectFrom('decision_log')
          .select(['kind', 'rule', 'detail_json'])
          .where('run_id', '=', runId)
          .where('rule', 'like', 'robots:%')
          .execute();
        // every skipped link is also in the decision log with its rule (SC-001: 100%)
        expect(
          refusals.filter((d) => d.kind === 'skip' || d.kind === 'refuse').length,
        ).toBeGreaterThanOrEqual(skipped.length);
        const notes = refusals.filter((d) => d.kind === 'note');
        expect(notes.length).toBeGreaterThan(0);
        expect(notes.every((n) => n.rule === 'robots:Disallow: /api/')).toBe(true);
        expect(JSON.parse(notes[0]!.detail_json!)).toMatchObject({ action: 'blocked' });

        const run = await ctx.db
          .selectFrom('runs')
          .select(['config_snapshot', 'coverage'])
          .where('id', '=', runId)
          .executeTakeFirstOrThrow();
        const snap = JSON.parse(run.config_snapshot) as Body;
        expect(snap.robots).toMatchObject({
          product_token: 'PathfinderAI-Crawler',
          page_requests: 'block',
          policies: [{ outcome: 'rules' }],
        });
        const evidence = JSON.parse(
          readFileSync(ctx.evidence.resolve(snap.robots.policies[0].evidence_ref), 'utf8'),
        ) as Body;
        expect(evidence.body).toContain('Disallow: *cHash*');
        expect(JSON.parse(run.coverage!).robots).toMatchObject({
          refused_navigations: expect.any(Number),
          page_requests_allowed: 0,
        });
        expect(JSON.parse(run.coverage!).robots.page_requests_blocked).toBeGreaterThan(0);
      }
    } finally {
      await cleanup();
    }
  }, 300_000);

  it('a direct navigate to a disallowed URL is refused with the robots rule', async () => {
    const { mock, call, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const r = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/formularze-online/?itm_campaign=x&cHash=02e3',
      });
      expect(r).toMatchObject({
        isError: true,
        body: { error: { code: 'ACTION_REFUSED', rule: 'robots:Disallow: *cHash*' } },
      });
      expect(mock.requests.filter((q) => q.url.includes('cHash'))).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('allow_and_record: the page own /api/ call goes out and is noted; navigations stay refused', async () => {
    const { mock, ctx, call, cleanup } = await insurer({}, { pageRequests: 'allow_and_record' });
    try {
      const runId = await mapPortal(call, 'insurer', mock.origin + '/');
      expect(mock.hits('/api/').length).toBeGreaterThan(0);
      expect(mock.requests.filter((r) => /cHash|^\/quote\/summary/.test(r.url))).toEqual([]);
      const notes = await ctx.db
        .selectFrom('decision_log')
        .select('detail_json')
        .where('run_id', '=', runId)
        .where('kind', '=', 'note')
        .execute();
      expect(notes.map((n) => JSON.parse(n.detail_json!).action)).toContain('allowed');
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('robots.txt 404: the run proceeds with policy no_rules', async () => {
    const { mock, ctx, call, cleanup } = await insurer({ robots: '404' });
    try {
      await mapPortal(call, 'insurer', mock.origin + '/');
      const rows = await ctx.db.selectFrom('robots_policies').select('outcome').execute();
      expect(rows.map((r) => r.outcome)).toEqual(['no_rules']);
      expect(mock.hits('/api/').length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  }, 120_000);

  it.each<['503' | 'loop']>([['503'], ['loop']])(
    'robots.txt %s: start_run refuses with ROBOTS_UNAVAILABLE in under 5 s, only robots requested',
    async (variant) => {
      const { mock, ctx, call, cleanup } = await insurer({ robots: variant });
      try {
        const t0 = Date.now();
        const r = await call('start_run', { portal_id: 'insurer', persona_id: 'guest' });
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(r).toMatchObject({ isError: true, body: { error: { code: 'ROBOTS_UNAVAILABLE' } } });
        expect(mock.requests.every((q) => /^\/robots(\.txt|-loop\/)/.test(q.url))).toBe(true);
        expect(await ctx.db.selectFrom('runs').selectAll().execute()).toEqual([]);
      } finally {
        await cleanup();
      }
    },
    60_000,
  );
});

describe.skipIf(!available)('insurer mock: url: denylist entries (spec 002 US2)', () => {
  it('skips only the sessionId link as denylisted with the url: entry', async () => {
    const { mock, ctx, call, cleanup } = await insurer(
      {},
      { denylist: '[logout, delete, payment, purchase, submit_request, "url:/*?*sessionId=*"]' },
    );
    try {
      const runId = await mapPortal(call, 'insurer', mock.origin + '/');
      expect(mock.requests.filter((r) => r.url.includes('sessionId'))).toEqual([]);
      expect(mock.hits('/porady/').length).toBeGreaterThan(0); // the plain link is followed
      const denied = await ctx.db
        .selectFrom('frontier')
        .select(['reason', 'action_json'])
        .where('run_id', '=', runId)
        .where('status', '=', 'denylisted')
        .execute();
      const bySession = denied.filter((d) => d.action_json.includes('sessionId'));
      expect(bySession.length).toBeGreaterThan(0);
      expect(bySession.every((d) => d.reason!.startsWith('url:/*?*sessionId=*'))).toBe(true);
      expect(denied.filter((d) => d.reason!.startsWith('url:')).length).toBe(bySession.length);
    } finally {
      await cleanup();
    }
  }, 120_000);
});

describe.skipIf(!available)('insurer mock: configuration only, generic ids (spec 002 US3)', () => {
  it('refuses purchase and submit_request controls, records the forms and never submits them', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const page = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/ubezpieczenia/dom',
      });
      const byName = Object.fromEntries(
        (page.body.actions as Body[]).map((a) => [a.accessible_name, a]),
      );
      expect(byName['Kup polisę']).toMatchObject({
        allowed: false,
        skip_reason: expect.stringMatching(/^purchase: /),
      });
      expect(byName['Wyślij zapytanie']).toMatchObject({
        allowed: false,
        skip_reason: expect.stringMatching(/^submit_request: /),
      });
      await crawl(call, runId, 300);
      expect((await call('finish_run', { run_id: runId })).body.status).toBe('completed');

      const forms = await ctx.db.selectFrom('forms').select('fields_json').execute();
      const fields = forms.flatMap((f) => (JSON.parse(f.fields_json) as Body[]).map((x) => x.name));
      expect(fields).toEqual(expect.arrayContaining(['email', 'vehicle', 'year']));
      expect(mock.requests.filter((r) => r.method !== 'GET')).toEqual([]);
      expect(mock.hits('/zapytanie')).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 120_000);
});

describe.skipIf(!available)('insurer mock: spec 001 end-to-end checks (spec 002 FR-020)', () => {
  it('maps read-only with evidence, confidence, locators and a frontier report; no PII stored', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = await mapPortal(call, 'insurer', mock.origin + '/');
      const states = await ctx.db.selectFrom('states').selectAll().execute();
      const edges = await ctx.db.selectFrom('edges').selectAll().execute();
      expect(states.length).toBeGreaterThan(3);
      for (const r of [...states, ...edges]) {
        expect(r.evidence_ref).toMatch(/^[0-9a-f]{64}\.yaml$/);
        expect(r.confidence).toBeTruthy();
      }
      expect(
        edges.filter((e) => e.status === 'executed').every((e) => e.safety_class === 'read'),
      ).toBe(true);
      const files = readdirSync(join(ctx.dir, 'evidence'));
      for (const e of edges) {
        const a = JSON.parse(e.action_json) as Body;
        expect(a.locators.length).toBeGreaterThan(0);
        expect(a.locators[0].kind).toBe('role');
        expect(files).toContain(a.snapshot_ref);
      }
      const report = renderReport(await buildFrontierReport(ctx.db, runId));
      expect(report).toContain('disallowed by robots.txt');
      expect(report).toContain('denylisted');
      const { findings } = await auditPii({ evidenceDir: join(ctx.dir, 'evidence'), db: ctx.db });
      expect(findings).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('stops on a 403 with zero further requests and no way to resume', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const home = await call('navigate', { run_id: runId, url: mock.origin + '/' });
      const blocked = await call('navigate', { run_id: runId, url: mock.origin + '/blocked' });
      expect(blocked.body.error.code).toBe('RUN_STOPPED');
      const run = await ctx.db.selectFrom('runs').selectAll().executeTakeFirstOrThrow();
      expect(run.status).toBe('stopped_warning');
      const count = mock.requests.length;
      expect(
        (await call('act', { run_id: runId, action_id: home.body.actions[0].action_id })).body.error
          .code,
      ).toBe('RUN_STOPPED');
      expect(
        (
          await call('start_run', {
            portal_id: 'insurer',
            persona_id: 'guest',
            resume_run_id: runId,
          })
        ).body.error.code,
      ).toBe('RUN_NOT_RESUMABLE');
      expect(mock.requests.length).toBe(count);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('resumes an interrupted run without duplicating states or edges', async () => {
    const { mock, ctx, call, runtime, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      await call('navigate', { run_id: runId, url: mock.origin + '/' });
      for (let i = 0; i < 3; i++) {
        const next = await call('get_next_frontier_item', { run_id: runId });
        await call('act', { run_id: runId, action_id: next.body.item.action_id });
      }
      const edgesBefore = (await ctx.db.selectFrom('edges').select('id').execute()).length;
      await runtime.closeAll();
      expect(await interruptStaleRuns(ctx)).toEqual([runId]);
      const resumed = await call('start_run', {
        portal_id: 'insurer',
        persona_id: 'guest',
        resume_run_id: runId,
      });
      expect(resumed.body).toMatchObject({ run_id: runId, resumed: true });
      expect(mock.hits('/robots.txt').length).toBe(2); // fetched again on resume
      await crawl(call, runId, 300);
      expect((await call('finish_run', { run_id: runId })).body.status).toBe('completed');
      const edges = await ctx.db.selectFrom('edges').selectAll().execute();
      const keys = edges.map((e) => `${e.from_state}|${e.action_json}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(edges.length).toBeGreaterThan(edgesBefore);
      const states = await ctx.db.selectFrom('states').selectAll().execute();
      expect(new Set(states.map((s) => s.fingerprint)).size).toBe(states.length);
    } finally {
      await cleanup();
    }
  }, 120_000);
});

describe.skipIf(!available)('insurer mock: portal action rules (spec 002 US4)', () => {
  it('refuses a portal rule and a German keyword on a built-in rule; applies to this portal only', async () => {
    const { mock, ctx, call, cleanup } = await insurer(
      {},
      {
        denylist:
          '[logout, delete, payment, purchase, submit_request, contact_or_message, renew_policy]',
        extra: [
          'action_rules:',
          '  - { id: renew_policy, class: external-side-effect, keywords: ["przedłuż polisę", "wznów polisę"], paths: ["/przedluzenie/*"] }',
          '  - { id: purchase, keywords: ["jetzt kaufen"] }',
          '',
        ].join('\n'),
      },
    );
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const page = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/ubezpieczenia/dom',
      });
      const byName = Object.fromEntries(
        (page.body.actions as Body[]).map((a) => [a.accessible_name, a]),
      );
      expect(byName['Przedłuż polisę']).toMatchObject({
        allowed: false,
        safety_class: 'external-side-effect',
        skip_reason: expect.stringMatching(/^renew_policy: /),
      });
      expect(byName['Jetzt kaufen']).toMatchObject({
        allowed: false,
        skip_reason: expect.stringMatching(/^purchase: /),
      });
      const direct = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/przedluzenie/start',
      });
      expect(direct.body.error).toMatchObject({ code: 'ACTION_REFUSED', rule: 'renew_policy' });
      expect(mock.hits('/przedluzenie')).toEqual([]);

      const report = renderReport(await buildFrontierReport(ctx.db, runId));
      expect(report).toContain('renew_policy');
      const snap = JSON.parse(
        (
          await ctx.db
            .selectFrom('runs')
            .select('config_snapshot')
            .where('id', '=', runId)
            .executeTakeFirstOrThrow()
        ).config_snapshot,
      ) as Body;
      expect(snap.rule_set).toEqual(
        expect.arrayContaining([
          { id: 'renew_policy', class: 'external-side-effect', origin: 'portal' },
          { id: 'purchase', class: 'external-side-effect', origin: 'builtin+portal' },
        ]),
      );
    } finally {
      await cleanup();
    }
  }, 60_000);
});
