import { computeFingerprint, FingerprintIndex } from '@mudpuppy/fingerprint';
import { describe, expect, it } from 'vitest';
import { recordState } from '../src/index.js';
import { seedKnownClusters } from '../src/services/known-clusters.js';
import { makeCtx, seedRun } from './helpers.js';

// spec 038 (LO-35, R-33 F-01): a page that varies between runs is one screen with revisions.
// A form of 30 named fields (names without digits: the fingerprint folds numbers); one persona
// sees one button more.
const FIELDS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Ą', 'Ć', 'Ę', 'Ł'].map(
  (c) => `    - textbox "Pole ${c}"`,
);
const PAGE = (extra: string[] = []) =>
  ['- main:', '  - heading "Konto" [level=1]', '  - form "Dane":', ...FIELDS, ...extra].join('\n');
const ROUTE = '/konto';
const fp = (snapshot: string) =>
  computeFingerprint({ routeTemplate: ROUTE, ariaSnapshot: snapshot });

describe('seedKnownClusters', () => {
  it("puts a later run's variant of a recorded page in the recorded cluster", async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const basic = PAGE();
    const ref = await ctx.evidence.storeText(basic, 'yaml');
    await recordState(ctx, {
      run_id: run,
      fingerprint: fp(basic).level1,
      cluster_id: 'cluster-recorded',
      route_template: ROUTE,
      title: 'Konto',
      evidence_ref: ref,
      confidence: 'observed',
    });

    // A fresh run's index knows nothing: the premium persona's extra button starts a cluster.
    const premium = fp(PAGE(['    - button "Oferta premium"']));
    expect(premium.level1).not.toBe(fp(basic).level1);
    expect(new FingerprintIndex().assign(premium).clusterId).not.toBe('cluster-recorded');

    const index = new FingerprintIndex();
    expect(seedKnownClusters(ctx, index, 'shop', ROUTE)).toBe(1);
    expect(index.assign(premium).clusterId).toBe('cluster-recorded');
    expect(index.assign(fp(basic)).decision.reason).toBe('identical-fingerprint');
    // other routes and portals are not seeded
    expect(seedKnownClusters(ctx, new FingerprintIndex(), 'shop', '/inne')).toBe(0);
    expect(seedKnownClusters(ctx, new FingerprintIndex(), 'other-portal', ROUTE)).toBe(0);
  });

  it('seeds one group per screen of the portal model, across crawler clusters (spec 039 T038)', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const ids: string[] = [];
    for (const [i, page] of [PAGE(), PAGE(['    - button "Oferta premium"'])].entries()) {
      const ref = await ctx.evidence.storeText(page, 'yaml');
      const { state_id } = await recordState(ctx, {
        run_id: run,
        fingerprint: fp(page).level1,
        cluster_id: `cluster-${i}`,
        route_template: ROUTE,
        title: 'Konto',
        evidence_ref: ref,
        confidence: 'observed',
      });
      ids.push(state_id);
    }
    expect(seedKnownClusters(ctx, new FingerprintIndex(), 'shop', ROUTE)).toBe(2);
    const at = '2026-10-20T00:00:00.000Z';
    ctx.raw
      .prepare(
        `INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold, stats_json)
         VALUES ('mv1', 'shop', 1, ?, 'minhash-avglink-v1', 0.9, '{}')`,
      )
      .run(at);
    ctx.raw
      .prepare(
        `INSERT INTO model_screens (id, key, portal_id, route_key, title, status, first_model_version, created_at)
         VALUES ('M1', 'SC-0001', 'shop', ?, 'Konto', 'active', 'mv1', ?)`,
      )
      .run(ROUTE, at);
    for (const [i, id] of ids.entries())
      ctx.raw
        .prepare(
          `INSERT INTO screen_members (screen_id, state_id, ordinal, assigned_by, from_model_version)
           VALUES ('M1', ?, ?, 'clustering', 'mv1')`,
        )
        .run(id, i + 1);
    const index = new FingerprintIndex();
    expect(seedKnownClusters(ctx, index, 'shop', ROUTE)).toBe(1);
    // Both recorded pages are exact members of the model screen's group.
    expect(index.assign(fp(PAGE(['    - button "Oferta premium"']))).clusterId).toBe('cluster-0');
  });
});
