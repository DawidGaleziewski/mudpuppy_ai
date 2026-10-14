import { describe, expect, it } from 'vitest';
import { buildFrontierReport, renderReport } from '@pathfinder/crawler';
import { crawl, mapPortal, type Body } from './harness.js';
import { available, insurer, useInsurerMocks } from './insurer-harness.js';

useInsurerMocks();

describe.skipIf(!available)(
  'insurer mock: query-aware urls.disallowed entries (spec 002 US2, spec 023 US3)',
  () => {
    it('skips only the sessionId link as out of scope with the urls.disallowed entry', async () => {
      const { mock, ctx, call, cleanup } = await insurer(
        {},
        {
          denylist: '[logout, delete, payment, purchase, submit_request]',
          extra: 'urls:\n  disallowed: ["/*?*sessionId=*"]\n',
        },
      );
      try {
        const runId = await mapPortal(call, 'insurer', mock.origin + '/');
        expect(mock.requests.filter((r) => r.url.includes('sessionId'))).toEqual([]);
        expect(mock.hits('/porady/').length).toBeGreaterThan(0); // the plain link is followed
        const denied = await ctx.db
          .selectFrom('frontier')
          .select(['reason', 'action_json'])
          .where('run_id', '=', runId)
          .where('status', '=', 'out_of_scope')
          .execute();
        const bySession = denied.filter((d) => d.action_json.includes('sessionId'));
        expect(bySession.length).toBeGreaterThan(0);
        expect(bySession.every((d) => d.reason!.includes('urls.disallowed /*?*sessionId=*'))).toBe(
          true,
        );
        expect(denied.filter((d) => d.reason!.includes('urls.disallowed')).length).toBe(
          bySession.length,
        );
      } finally {
        await cleanup();
      }
    }, 120_000);
  },
);

describe.skipIf(!available)('insurer mock: configuration only, generic ids (spec 002 US3)', () => {
  it('refuses purchase and submit_request controls, records the forms and never submits them', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const page = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/ubezpieczenia/dom',
        rationale: 'exploring the target URL',
      });
      // spec 019 F-05: name the error when navigate fails instead of a TypeError on `actions`
      expect(page.body.actions, JSON.stringify(page.body).slice(0, 2000)).toBeDefined();
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
      expect(
        (await call('finish_run', { run_id: runId, rationale: 'frontier exhausted' })).body.status,
      ).toBe('completed');

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
        rationale: 'exploring the target URL',
      });
      // spec 019 F-05: name the error when navigate fails instead of a TypeError on `actions`
      expect(page.body.actions, JSON.stringify(page.body).slice(0, 2000)).toBeDefined();
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
        rationale: 'exploring the target URL',
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
