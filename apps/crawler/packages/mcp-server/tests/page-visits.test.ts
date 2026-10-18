import { newId, nowIso } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import { recordPageVisit, recordState, upsertBuilds } from '../src/index.js';
import type { ServerContext } from '../src/context.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

const CONTEXT = 'a'.repeat(64);

async function journeyOf(ctx: ServerContext, run: string): Promise<string> {
  const id = newId();
  await ctx.db
    .insertInto('journeys')
    .values({
      id,
      run_id: run,
      parent_journey_id: null,
      branch_seq: null,
      start_kind: 'entry_url',
      checkpoint_id: null,
      end_reason: null,
      started_at: nowIso(),
      ended_at: null,
    })
    .execute();
  return id;
}

describe('recordPageVisit (spec 019, R-37/R-38; spec 039 observations)', () => {
  it('stores every arrival with its verbatim URL and hops, also on a known state', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const journey = await journeyOf(ctx, run);
    const { state_id } = await recordState(ctx, {
      run_id: run,
      fingerprint: FP('e'),
      cluster_id: 'c',
      route_template: '/sklep',
      title: 'Sklep',
      evidence_ref: REF,
      confidence: 'observed',
    });
    const hops = [
      { url: 'https://shop.test/shop/index.php?cat=7', kind: 'start' as const },
      { url: 'https://shop.test/old/kategoria/7', kind: 'http' as const, status: 301 },
      {
        url: 'https://shop.test/sklep?kategoria=7&utm_source=x',
        kind: 'http' as const,
        status: 302,
      },
    ];
    const v2 = { journey_id: journey, result: 'ok' as const, context_key: CONTEXT, flags: {} };
    await recordPageVisit(ctx, {
      run_id: run,
      state_id,
      edge_id: null,
      via: 'navigate',
      url: 'https://shop.test/sklep?kategoria=7&utm_source=x',
      hops,
      ...v2,
      seq: 1,
      build_ids: [],
    });
    await recordPageVisit(ctx, {
      run_id: run,
      state_id,
      edge_id: null,
      via: 'navigate',
      url: 'https://shop.test/sklep?strona=2',
      hops: [],
      ...v2,
      seq: 2,
      build_ids: [],
    });
    const rows = await ctx.db
      .selectFrom('page_visits')
      .select(['url', 'hops_json', 'via', 'seq', 'journey_id'])
      .where('state_id', '=', state_id)
      .orderBy('created_at')
      .execute();
    expect(rows.map((r) => r.url)).toEqual([
      'https://shop.test/sklep?kategoria=7&utm_source=x',
      'https://shop.test/sklep?strona=2',
    ]);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows[0]!.journey_id).toBe(journey);
    expect(JSON.parse(rows[0]!.hops_json)).toEqual(hops);
  });

  it('links the builds that served the visit; a build is one row per portal, scope and signature', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const journey = await journeyOf(ctx, run);
    const { state_id } = await recordState(ctx, {
      run_id: run,
      fingerprint: FP('f'),
      cluster_id: 'c',
      route_template: '/',
      title: 'Start',
      evidence_ref: REF,
      confidence: 'observed',
    });
    const shell = {
      scope: 'shell',
      signature: 'b'.repeat(64),
      source: 'assets' as const,
      assets: ['/a.3e1a9c21.js'],
    };
    const ids = await upsertBuilds(ctx, 'p1', [shell]);
    expect(await upsertBuilds(ctx, 'p1', [shell])).toEqual(ids);
    await recordPageVisit(ctx, {
      run_id: run,
      state_id,
      edge_id: null,
      via: 'navigate',
      url: 'https://x.test/',
      hops: [],
      journey_id: journey,
      seq: 1,
      result: 'technical_error',
      context_key: CONTEXT,
      flags: { 'cookie:ab': 'B' },
      build_ids: ids,
    });
    const links = await ctx.db.selectFrom('observation_builds').selectAll().execute();
    expect(links.map((l) => l.build_id)).toEqual(ids);
    const visit = await ctx.db.selectFrom('page_visits').selectAll().executeTakeFirstOrThrow();
    expect(visit.result).toBe('technical_error');
    expect(JSON.parse(visit.flags_json)).toEqual({ 'cookie:ab': 'B' });
  });

  it('refuses an unknown hop kind and a visit without its journey fields', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    await expect(
      recordPageVisit(ctx, {
        run_id: run,
        state_id: 's',
        edge_id: null,
        via: 'navigate',
        url: 'https://x.test/',
        hops: [{ url: 'https://x.test/', kind: 'warp' as never }],
        journey_id: 'j',
        seq: 1,
        result: 'ok',
        context_key: CONTEXT,
        flags: {},
        build_ids: [],
      }),
    ).rejects.toThrow();
    await expect(
      recordPageVisit(ctx, {
        run_id: run,
        state_id: 's',
        edge_id: null,
        via: 'navigate',
        url: 'https://x.test/',
        hops: [],
      } as never),
    ).rejects.toThrow();
  });
});
