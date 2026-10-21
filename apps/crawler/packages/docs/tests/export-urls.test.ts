import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSrs } from '../src/export.js';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '../src/testing/index.js';

/** Spec 019 T016: a screen's observed URLs and URL parameters reach the SRS export. */
let fx: FixtureStore;
let files: Map<string, string>;

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seedDocRecords(fx);
  const insert = fx.raw.prepare(
    `INSERT INTO observations (id, run_id, state_id, transition_id, via, url, hops_json, created_at)
     VALUES (?, ?, ?, NULL, 'navigate', ?, ?, ?)`,
  );
  for (const [i, state] of Object.values(fx.states).entries()) {
    insert.run(
      `visit-${i}-a`,
      fx.runId,
      state,
      `https://ref.test/s${i}?wariant=pelny&sid=AB12`,
      JSON.stringify([
        { url: `https://ref.test/stare${i}.php`, kind: 'start' },
        { url: `https://ref.test/s${i}?wariant=pelny&sid=AB12`, kind: 'http', status: 301 },
      ]),
      '2026-10-01T10:00:00.000Z',
    );
    insert.run(
      `visit-${i}-b`,
      fx.runId,
      state,
      `https://ref.test/s${i}?wariant=skrocony`,
      '[]',
      '2026-10-01T10:01:00.000Z',
    );
  }
  files = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' }) as Map<string, string>;
});
afterAll(() => fx.close());

describe('SRS export: URLs and parameters per screen (spec 019, R-37/R-38)', () => {
  it('lists the URLs a screen was reached under, with the hops, and its parameters', () => {
    const md = files.get('03-screens.md')!;
    expect(md).toContain('**URLs observed** (verbatim):');
    expect(md).toMatch(/`https:\/\/ref\.test\/s\d\?wariant=pelny&sid=AB12` \(1 visit; via http\)/);
    expect(md).toContain('**URL parameters:**');
    expect(md).toMatch(/\| `wariant` \| query \| `pelny`, `skrocony` \| 2 \|/);
  });

  it('carries the same in records.json on screen records only', () => {
    const json = JSON.parse(files.get('records.json')!) as {
      records: { kind: string; urls?: { params: { name: string }[] } }[];
    };
    const withUrls = json.records.filter((r) => r.urls);
    expect(withUrls.length).toBeGreaterThan(0);
    expect(withUrls.every((r) => r.kind === 'screen')).toBe(true);
    expect(withUrls[0]!.urls!.params.map((p) => p.name)).toEqual(['wariant', 'sid']);
  });
});
