import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PORTAL_TABLES, deletePortal, exportPortal, type OpenedDb } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { interruptStaleRuns } from '../src/index.js';
import { crawl, mapPortal, startHarness } from './harness.js';
import { startMockInsurer } from './mock-insurer.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';

const available = await canLaunchBrowser();

const portalYaml = (id: string, origin: string, obstacle: string) => `
id: ${id}
base_url: ${origin}/
environment: sandbox
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  max_depth: 3
  max_states: 30
  max_actions_per_state: 30
  max_run_time_minutes: 5
  max_steps: 40
denylist: [logout, delete, payment, purchase, submit_request, contact_or_message, reveal_contact]
obstacles:
  - { id: consent, selector: "${obstacle}" }
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (+ops@corp.pl)" }
`;
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let shop: MockPortal;
let insurer: MockPortal;
beforeAll(async () => {
  if (!available) return;
  shop = await startMockPortal();
  insurer = await startMockInsurer();
});
afterAll(async () => {
  await shop?.close();
  await insurer?.close();
});

/** Every row of a portal, per table, for byte-identity checks. */
function rowsOf(raw: OpenedDb['raw'], portal: string): string {
  const out: Record<string, unknown[]> = {};
  for (const t of PORTAL_TABLES) {
    const sql =
      t === 'runs' || t === 'states'
        ? `SELECT * FROM ${t} WHERE portal_id = ? ORDER BY 1, 2`
        : `SELECT * FROM ${t} WHERE run_id IN (SELECT id FROM runs WHERE portal_id = ?) ORDER BY 1, 2`;
    out[t] = raw.prepare(sql).all(portal);
  }
  return JSON.stringify(out);
}

describe.skipIf(!available)('portal workspaces (spec 002 US5, SC-008, SC-009)', () => {
  it('keeps two portals apart in one database; export and delete touch only one', async () => {
    const h = await startHarness({
      'portals/shop/portal.yaml': portalYaml('shop', shop.origin, '#cookie button.accept'),
      'personas/shop/guest.yaml': PERSONA,
      'portals/insurer/portal.yaml':
        portalYaml('insurer', insurer.origin, '#CybotCookiebotDialogBodyButtonDecline') +
        'action_rules:\n  - { id: renew_policy, class: external-side-effect, keywords: ["przedłuż polisę"] }\n',
      'personas/insurer/guest.yaml': PERSONA,
    });
    const { ctx, call, runtime } = h;
    try {
      const shopRun = await mapPortal(call, 'shop', shop.origin + '/');
      await mapPortal(call, 'insurer', insurer.origin + '/');
      // a portal's own rules apply only to its runs (spec 002 FR-019)
      const shopSnap = JSON.parse(
        (
          await ctx.db
            .selectFrom('runs')
            .select('config_snapshot')
            .where('id', '=', shopRun)
            .executeTakeFirstOrThrow()
        ).config_snapshot,
      ) as { rule_set: { id: string; origin: string }[] };
      expect(shopSnap.rule_set.every((r) => r.origin === 'builtin')).toBe(true);
      expect(shopSnap.rule_set.map((r) => r.id)).not.toContain('renew_policy');

      // identical page on both portals: two states, one per portal, never merged (SC-009)
      const cookieRun = async (portal: string, origin: string) => {
        const id = (await call('start_run', { portal_id: portal, persona_id: 'guest' })).body
          .run_id as string;
        const page = await call('navigate', { run_id: id, url: origin + '/cookies' });
        return { id, stateId: page.body.state_id as string };
      };
      const a = await cookieRun('shop', shop.origin);
      const b = await cookieRun('insurer', insurer.origin);
      expect(a.stateId).not.toBe(b.stateId);
      const pair = await ctx.db
        .selectFrom('states')
        .select(['portal_id', 'fingerprint'])
        .where('id', 'in', [a.stateId, b.stateId])
        .execute();
      expect(pair.map((s) => s.portal_id).sort()).toEqual(['insurer', 'shop']);
      expect(pair[0]!.fingerprint).toBe(pair[1]!.fingerprint);
      await call('finish_run', { run_id: a.id }).catch(() => undefined);

      // leave the insurer run interrupted, to prove it stays resumable after the delete
      await runtime.closeAll();
      await interruptStaleRuns(ctx);
      await ctx.db
        .updateTable('runs')
        .set({ status: 'completed' })
        .where('portal_id', '=', 'shop')
        .execute();

      const insurerBefore = rowsOf(ctx.raw, 'insurer');
      const evidenceDir = join(ctx.dir, 'evidence');
      const insurerRefs = new Set(insurerBefore.match(/[0-9a-f]{64}\.[a-z0-9]{1,8}/g) ?? []);
      const insurerFiles = Object.fromEntries(
        [...insurerRefs].map((r) => [r, readFileSync(join(evidenceDir, r), 'utf8')]),
      );

      const out = join(ctx.dir, 'export');
      exportPortal({
        raw: ctx.raw,
        evidenceDir,
        portal: 'shop',
        environment: 'sandbox',
        outDir: out,
        operator: 'qa',
      });
      expect(readFileSync(join(out, 'runs.ndjson'), 'utf8')).not.toContain('"insurer"');
      expect(readFileSync(join(out, 'states.ndjson'), 'utf8')).not.toContain('"insurer"');

      const plan = deletePortal({
        raw: ctx.raw,
        evidenceDir,
        portal: 'shop',
        environment: 'sandbox',
        operator: 'qa',
      });
      expect(plan.evidenceToRemove.length).toBeGreaterThan(0);
      const gone = JSON.parse(rowsOf(ctx.raw, 'shop')) as Record<string, unknown[]>;
      for (const rows of Object.values(gone)) expect(rows).toEqual([]);
      for (const r of plan.evidenceToRemove) expect(readdirSync(evidenceDir)).not.toContain(r);

      // the other portal: rows and evidence byte-identical (SC-008)
      expect(rowsOf(ctx.raw, 'insurer')).toBe(insurerBefore);
      for (const [r, content] of Object.entries(insurerFiles))
        expect(readFileSync(join(evidenceDir, r), 'utf8')).toBe(content);
      const log = await ctx.db.selectFrom('portal_data_log').selectAll().execute();
      expect(log.map((l) => [l.action, l.operator])).toEqual([
        ['export', 'qa'],
        ['delete', 'qa'],
      ]);

      // ...and still resumable
      const h2 = await startHarness({}, ctx);
      try {
        const resumed = await h2.call('start_run', {
          portal_id: 'insurer',
          persona_id: 'guest',
          resume_run_id: b.id,
        });
        expect(resumed.body).toMatchObject({ run_id: b.id, resumed: true });
        await crawl(h2.call, b.id, 5);
      } finally {
        await h2.cleanup();
      }
    } finally {
      await h.cleanup();
    }
  }, 240_000);
});
