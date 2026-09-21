import { mkdirSync, writeFileSync } from 'node:fs';
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

async function repo(files: Record<string, string>) {
  const ctx = await makeCtx();
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
