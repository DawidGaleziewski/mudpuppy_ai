import { computeFingerprint, FingerprintIndex } from '@pathfinder/fingerprint';
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
});
