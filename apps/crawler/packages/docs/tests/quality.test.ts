import { describe, expect, it } from 'vitest';
import { qualityFindings } from '../src/index.js';
import { makeFixtureStore, seedDocRecords } from '../src/testing/index.js';

describe('qualityFindings (spec 030 R-65, field GC-21, SQ-6, SQ-2)', () => {
  it('flags a use case whose steps cite no screen region, and nothing about a portal with requirements', async () => {
    const fx = await makeFixtureStore({ deterministicIds: true });
    seedDocRecords(fx);
    const found = qualityFindings(fx.raw, fx.portalId);
    const uncited = found.filter((f) => f.check === 'steps_uncited');
    expect(uncited.length).toBeGreaterThan(0);
    expect(uncited[0]!.detail).toMatch(/flow steps, 0 screen region\(s\) cited/);
    expect(found.filter((f) => f.check === 'no_requirements')).toEqual([]);
  });

  it('flags screens without any requirement or rule, and two screens on one route template', async () => {
    const fx = await makeFixtureStore({ deterministicIds: true });
    seedDocRecords(fx);
    fx.raw
      .prepare(
        "UPDATE doc_records SET withdrawn = 1 WHERE kind IN ('requirement', 'business_rule')",
      )
      .run();
    const found = qualityFindings(fx.raw, fx.portalId);
    expect(found.some((f) => f.check === 'no_requirements' && f.key === null)).toBe(true);
    const screens = fx.raw
      .prepare(
        `SELECT v.id, v.content_json FROM doc_records r JOIN doc_revisions v
           ON v.record_id = r.id AND v.rev_no = r.latest_rev WHERE r.kind = 'screen' AND r.withdrawn = 0`,
      )
      .all() as { id: string; content_json: string }[];
    const route = (JSON.parse(screens[0]!.content_json) as { route_templates: string[] })
      .route_templates[0]!;
    const second = JSON.parse(screens[1]!.content_json) as { route_templates: string[] };
    second.route_templates = [route];
    fx.raw
      .prepare('UPDATE doc_revisions SET content_json = ? WHERE id = ?')
      .run(JSON.stringify(second), screens[1]!.id);
    expect(
      qualityFindings(fx.raw, fx.portalId).some((f) => f.check === 'duplicate_screen_route'),
    ).toBe(true);
  });
});
