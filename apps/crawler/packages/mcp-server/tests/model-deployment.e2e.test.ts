import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startReferencePortal, type ReferencePortal } from '@mudpuppy/reference-portal';
import { startHarness } from './harness.js';

/**
 * The Deployment scenario end to end (spec 039 design § 19.1): a scan, then a new release of the
 * reference portal (a new bundle hash and one more field on the vehicle form) and a second scan.
 * The capture names both builds, the model keeps one vehicle screen, and the reconciler explains
 * the new page version as structural drift by rule R2, applied without a person.
 */
const available = await canLaunchBrowser();

const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const portalYaml = (origin: string) => `
id: reference-insurer
base_url: ${origin}/
environment: sandbox
compliance:
  robots_checked_on: 2026-10-02
  terms_reviewed_on: 2026-10-02
  terms_reviewed_by: local test portal, no terms
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 50
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 2
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (local reference portal)" }
`;

let portal: ReferencePortal;
let h: Awaited<ReturnType<typeof startHarness>>;

beforeAll(async () => {
  if (!available) return;
  portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
});

afterAll(async () => {
  await h?.cleanup();
  await portal?.close();
});

async function scan(paths: readonly string[]): Promise<void> {
  const start = await h.call('start_run', { portal_id: 'reference-insurer', persona_id: 'guest' });
  const runId = start.body.run_id as string;
  for (const path of paths) {
    const r = await h.call('navigate', {
      run_id: runId,
      url: new URL(path, portal.url).href,
      rationale: 'deployment scenario',
    });
    expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
  }
  // Two steps use up the scan budget (`max_steps: 2`), so the run may finish with items queued.
  const done = await h.call('finish_run', { run_id: runId, rationale: 'step budget used' });
  expect(done.isError, JSON.stringify(done.body)).toBeFalsy();
}

describe.skipIf(!available)('Deployment scenario (spec 039 M3)', () => {
  it('a new release that adds a field is structural drift, derived by R2', async () => {
    await scan(['/', '/kalkulator/pojazd']);
    await portal.close();
    // The release is served on a fresh port: a reused one can be taken by another test file in
    // the meantime. Route templates are paths only, so the same pages are the same states.
    portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: ['deployment'] });
    writeFileSync(
      join(h.ctx.root, 'portals/reference-insurer/portal.yaml'),
      portalYaml(portal.url.replace(/\/$/, '')),
    );
    await scan(['/kalkulator/pojazd', '/']);

    const raw = h.ctx.raw;
    const builds = raw
      .prepare("SELECT source FROM builds WHERE scope = 'shell' ORDER BY first_seen")
      .all();
    expect(builds).toEqual([{ source: 'assets' }, { source: 'assets' }]);
    const versions = raw.prepare('SELECT seq FROM model_versions ORDER BY seq').all();
    expect(versions).toEqual([{ seq: 1 }, { seq: 2 }]);
    const vehicle = raw
      .prepare(
        `SELECT s.id, count(m.state_id) AS members FROM model_screens s
         JOIN screen_members m ON m.screen_id = s.id AND m.to_model_version IS NULL
         WHERE s.route_key = '/kalkulator/pojazd' GROUP BY s.id`,
      )
      .all() as { id: string; members: number }[];
    expect(vehicle).toHaveLength(1);
    expect(vehicle[0]!.members).toBe(2);
    // The release shows twice: the vehicle screen's new page version and its new field. R2
    // explains both from the changed shell build; nothing waits for a person.
    const explained = raw
      .prepare(
        `SELECT d.kind AS deviation, h.kind, h.rule, h.derived, d.status FROM deviations d
         JOIN hypotheses h ON h.deviation_id = d.id ORDER BY d.kind`,
      )
      .all();
    expect(explained).toEqual([
      {
        deviation: 'new_action',
        kind: 'structural_drift',
        rule: 'R2',
        derived: 1,
        status: 'explained',
      },
      {
        deviation: 'new_member',
        kind: 'structural_drift',
        rule: 'R2',
        derived: 1,
        status: 'explained',
      },
    ]);
    const action = raw
      .prepare(
        "SELECT element_key FROM deviations d JOIN action_classes a ON a.id = d.action_class_id WHERE d.kind = 'new_action'",
      )
      .get() as { element_key: string };
    expect(action.element_key).toContain('liczba drzwi');
  }, 120_000);
});
