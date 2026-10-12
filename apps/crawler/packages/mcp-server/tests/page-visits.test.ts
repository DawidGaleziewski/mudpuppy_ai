import { describe, expect, it } from 'vitest';
import { recordPageVisit, recordState } from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

describe('recordPageVisit (spec 019, R-37/R-38)', () => {
  it('stores every arrival with its verbatim URL and hops, also on a known state', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
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
    await recordPageVisit(ctx, {
      run_id: run,
      state_id,
      edge_id: null,
      via: 'navigate',
      url: 'https://shop.test/sklep?kategoria=7&utm_source=x',
      hops,
    });
    await recordPageVisit(ctx, {
      run_id: run,
      state_id,
      edge_id: null,
      via: 'navigate',
      url: 'https://shop.test/sklep?strona=2',
      hops: [],
    });
    const rows = await ctx.db
      .selectFrom('page_visits')
      .select(['url', 'hops_json', 'via'])
      .where('state_id', '=', state_id)
      .orderBy('created_at')
      .execute();
    expect(rows.map((r) => r.url)).toEqual([
      'https://shop.test/sklep?kategoria=7&utm_source=x',
      'https://shop.test/sklep?strona=2',
    ]);
    expect(JSON.parse(rows[0]!.hops_json)).toEqual(hops);
  });

  it('refuses an unknown hop kind', async () => {
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
      }),
    ).rejects.toThrow();
  });
});
