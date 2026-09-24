import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ToolError, startRunRecord } from '../src/index.js';
import { makeCtx } from './helpers.js';

const portal = (
  o: { env?: string; base?: string; domain?: string; compliance?: boolean; ua?: string } = {},
) => `
id: shop
base_url: ${o.base ?? 'https://shop.pl/'}
environment: ${o.env ?? 'production'}
compliance:
  robots_checked_on: ${o.compliance === false ? 'null' : '2026-09-20'}
  terms_reviewed_on: ${o.compliance === false ? 'null' : '2026-09-21'}
  terms_reviewed_by: ${o.compliance === false ? 'null' : 'dawid'}
scope:
  allowed_domains: [${o.domain ?? 'shop.pl'}]
  allowed_paths: ["/*"]
  max_depth: 6
  max_states: 500
  max_actions_per_state: 20
  max_run_time_minutes: 60
  max_steps: 2000
denylist: [logout]
rate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: "${o.ua ?? 'PathfinderAI-Crawler/0.1 (+ops@corp.pl)'}" }
`;
const persona = `id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1366, height: 768 }\nlocale: pl-PL\nbudgets: { max_steps: 100 }\n`;

/** robots.txt replies per URL; anything else answers 404 (no rules). */
function robotsFetch(routes: Record<string, { status: number; body?: string } | Error> = {}) {
  const calls: string[] = [];
  const f = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url] ?? { status: 404 };
    if (r instanceof Error) throw r;
    return new Response(r.body ?? '', { status: r.status });
  }) as typeof fetch;
  return { f, calls };
}

async function repo(files: Record<string, string>, fetchImpl = robotsFetch().f) {
  const ctx = await makeCtx();
  ctx.fetch = fetchImpl;
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  }
  return ctx;
}
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ToolError).code;
  }
  return 'none';
}
const files = (o?: Parameters<typeof portal>[0]) => ({
  'portals/shop/portal.yaml': portal(o),
  'personas/shop/guest.yaml': persona,
});

describe('start_run (database part)', () => {
  it('creates a run with the resolved, narrowed config snapshot', async () => {
    const ctx = await repo(files());
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    expect(output).toMatchObject({
      resumed: false,
      effective_max_action_class: 'read',
      budgets: { steps: 100 },
    });
    const run = await ctx.db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', output.run_id)
      .executeTakeFirstOrThrow();
    expect(run).toMatchObject({
      mode: 'map',
      status: 'running',
      environment: 'production',
      viewport: '1366x768',
      locale: 'pl-PL',
      portal_id: 'shop',
      persona_id: 'guest',
    });
    const snap = JSON.parse(run.config_snapshot);
    expect(snap.scope.max_steps).toBe(100);
    expect(snap.persona.id).toBe('guest');
    expect(snap.effective_max_action_class).toBe('read');
  });

  it('refuses with ENV_GUARD_REFUSED and creates no run (production flag, null compliance, placeholder UA)', async () => {
    for (const o of [
      { env: 'sandbox' },
      { compliance: false },
      { ua: 'PathfinderAI (+contact@example.com)' },
    ]) {
      const ctx = await repo(files(o));
      expect(await code(startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' }))).toBe(
        'ENV_GUARD_REFUSED',
      );
      expect(await ctx.db.selectFrom('runs').selectAll().execute()).toHaveLength(0);
    }
  });

  it('reports CONFIG_INVALID naming the file, and PORTAL_NOT_FOUND', async () => {
    const ctx = await repo({
      'portals/shop/portal.yaml': 'id: shop\n',
      'personas/shop/guest.yaml': persona,
    });
    try {
      await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
      expect.unreachable();
    } catch (e) {
      expect((e as ToolError).code).toBe('CONFIG_INVALID');
      expect((e as ToolError).message).toContain('portal.yaml');
    }
    expect(await code(startRunRecord(ctx, { portal_id: 'nope', persona_id: 'guest' }))).toBe(
      'PORTAL_NOT_FOUND',
    );
  });

  it('refuses a portal of another environment than the database', async () => {
    const ctx = await repo(
      files({ env: 'sandbox', base: 'http://localhost:9000/', domain: 'localhost' }),
    );
    expect(await code(startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' }))).toBe(
      'ENV_GUARD_REFUSED',
    );
    ctx.dbEnvironment = 'sandbox';
    expect(
      (await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' })).output.resumed,
    ).toBe(false);
  });

  it('resumes only an interrupted run of the same portal and persona', async () => {
    const ctx = await repo(files());
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    expect(
      await code(
        startRunRecord(ctx, {
          portal_id: 'shop',
          persona_id: 'guest',
          resume_run_id: output.run_id,
        }),
      ),
    ).toBe('RUN_NOT_RESUMABLE'); // still running
    await ctx.db
      .updateTable('runs')
      .set({ status: 'interrupted', steps_used: 40 })
      .where('id', '=', output.run_id)
      .execute();
    const again = await startRunRecord(ctx, {
      portal_id: 'shop',
      persona_id: 'guest',
      resume_run_id: output.run_id,
    });
    expect(again.output).toMatchObject({
      run_id: output.run_id,
      resumed: true,
      budgets: { steps: 60 },
    });
    expect(
      (await ctx.db.selectFrom('runs').select('status').executeTakeFirstOrThrow()).status,
    ).toBe('running');
    expect(await ctx.db.selectFrom('runs').selectAll().execute()).toHaveLength(1);
    expect(
      await code(
        startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest', resume_run_id: 'ghost' }),
      ),
    ).toBe('RUN_NOT_RESUMABLE');
  });

  it('never resumes a stopped_warning run', async () => {
    const ctx = await repo(files());
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    await ctx.db
      .updateTable('runs')
      .set({ status: 'stopped_warning', warning: 'HTTP 403' })
      .where('id', '=', output.run_id)
      .execute();
    expect(
      await code(
        startRunRecord(ctx, {
          portal_id: 'shop',
          persona_id: 'guest',
          resume_run_id: output.run_id,
        }),
      ),
    ).toBe('RUN_NOT_RESUMABLE');
  });
});

describe('start_run: robots.txt (FR-001, FR-004 to FR-006)', () => {
  const runs = (ctx: Awaited<ReturnType<typeof repo>>) =>
    ctx.db.selectFrom('runs').selectAll().execute();

  it.each<[string, { status: number } | Error]>([
    ['503', { status: 503 }],
    ['a network error', new TypeError('fetch failed')],
  ])(
    'refuses with ROBOTS_UNAVAILABLE on %s, before any run row, fast (SC-003)',
    async (_n, reply) => {
      const r = robotsFetch({ 'https://shop.pl/robots.txt': reply });
      const ctx = await repo(files(), r.f);
      const t0 = Date.now();
      let err: ToolError | undefined;
      try {
        await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
      } catch (e) {
        err = e as ToolError;
      }
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(err?.code).toBe('ROBOTS_UNAVAILABLE');
      expect(err?.message).toContain('https://shop.pl/robots.txt');
      expect(r.calls).toEqual(['https://shop.pl/robots.txt']);
      expect(await runs(ctx)).toHaveLength(0);
      expect(await ctx.db.selectFrom('robots_policies').selectAll().execute()).toHaveLength(0);
    },
  );

  it('404 → the run starts with policy no_rules, recorded in the snapshot and robots_policies', async () => {
    const ctx = await repo(files());
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    const [run] = await runs(ctx);
    const snap = JSON.parse(run!.config_snapshot) as { robots: Record<string, unknown> };
    const rows = await ctx.db.selectFrom('robots_policies').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      run_id: output.run_id,
      host: 'shop.pl',
      outcome: 'no_rules',
      http_status: 404,
      product_token: 'PathfinderAI-Crawler',
      truncated: 0,
    });
    expect(JSON.parse(run!.config_snapshot).rule_set).toEqual(
      expect.arrayContaining([
        { id: 'purchase', class: 'external-side-effect', origin: 'builtin' },
        { id: 'submit_request', class: 'external-side-effect', origin: 'builtin' },
      ]),
    );
    expect(snap.robots).toEqual({
      product_token: 'PathfinderAI-Crawler',
      page_requests: 'block',
      policies: [
        {
          host: 'shop.pl',
          policy_id: rows[0]!.id,
          outcome: 'no_rules',
          evidence_ref: rows[0]!.evidence_ref,
        },
      ],
    });
    const evidence = JSON.parse(
      readFileSync(ctx.evidence.resolve(rows[0]!.evidence_ref), 'utf8'),
    ) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      source_url: 'https://shop.pl/robots.txt',
      http_status: 404,
      outcome: 'no_rules',
    });
  });

  it('re-fetches on resume and logs a change of rules', async () => {
    let body = 'User-agent: *\nDisallow: /a\n';
    const f = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const ctx = await repo(files(), f);
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    await ctx.db.updateTable('runs').set({ status: 'interrupted' }).execute();
    body = 'User-agent: *\nDisallow: /b\n';
    await startRunRecord(ctx, {
      portal_id: 'shop',
      persona_id: 'guest',
      resume_run_id: output.run_id,
    });
    const rows = await ctx.db
      .selectFrom('robots_policies')
      .selectAll()
      .orderBy('fetched_at')
      .execute();
    expect(rows.map((r) => r.outcome)).toEqual(['rules', 'rules']);
    expect(rows[0]!.content_sha256).not.toBe(rows[1]!.content_sha256);
    const notes = await ctx.db
      .selectFrom('decision_log')
      .selectAll()
      .where('kind', '=', 'note')
      .execute();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.rule).toBe('robots:changed');
  });

  it('refuses a resume with ROBOTS_UNAVAILABLE and leaves the run interrupted', async () => {
    let status = 200;
    const f = (async () => new Response('', { status })) as typeof fetch;
    const ctx = await repo(files(), f);
    const { output } = await startRunRecord(ctx, { portal_id: 'shop', persona_id: 'guest' });
    await ctx.db.updateTable('runs').set({ status: 'interrupted' }).execute();
    status = 500;
    expect(
      await code(
        startRunRecord(ctx, {
          portal_id: 'shop',
          persona_id: 'guest',
          resume_run_id: output.run_id,
        }),
      ),
    ).toBe('ROBOTS_UNAVAILABLE');
    expect((await runs(ctx))[0]!.status).toBe('interrupted');
  });
});
