import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startReferencePortal, type ReferencePortal } from '@pathfinder/reference-portal';
import { startHarness } from './harness.js';

/**
 * Scenario not-visited (spec 039 design § 6.6, § 19.1; spec 040 T036), run-side: a scan, a new
 * release, then scans that skip the home page. A screen nobody looked at on the new release is
 * not checked there: its links are `untested`, the screen stays active, and nothing about it is
 * missing or removed. Absence needs a look; not looking is not evidence.
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
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
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
      rationale: 'not-visited scenario',
    });
    expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
  }
  const done = await h.call('finish_run', { run_id: runId, rationale: 'step budget used' });
  expect(done.isError, JSON.stringify(done.body)).toBeFalsy();
}

describe.skipIf(!available)('scenario not-visited (spec 040 T036)', () => {
  it('a screen skipped on a new release is untested, never missing or removed', async () => {
    await scan(['/', '/kalkulator/pojazd']);
    await portal.close();
    portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: ['deployment'] });
    writeFileSync(
      join(h.ctx.root, 'portals/reference-insurer/portal.yaml'),
      portalYaml(portal.url.replace(/\/$/, '')),
    );
    // Two scans that skip the home page: twice is what makes a link "not seen since" when looked at.
    await scan(['/kalkulator/pojazd', '/kontakt']);
    await scan(['/kontakt', '/kalkulator/pojazd']);

    const raw = h.ctx.raw;
    const home = raw
      .prepare("SELECT id, status FROM model_screens WHERE route_key = '/'")
      .get() as { id: string; status: string };
    expect(home.status).toBe('active');
    const statuses = (
      raw
        .prepare('SELECT DISTINCT status FROM action_classes WHERE screen_id = ?')
        .all(home.id) as { status: string }[]
    ).map((r) => r.status);
    expect(statuses).toEqual(['untested']);
    const missing = raw
      .prepare(
        "SELECT count(*) AS n FROM deviations WHERE screen_id = ? AND kind = 'missing_action'",
      )
      .get(home.id) as { n: number };
    expect(missing.n).toBe(0);
    const removed = raw
      .prepare("SELECT count(*) AS n FROM hypotheses WHERE kind = 'removed'")
      .get() as { n: number };
    expect(removed.n).toBe(0);
  }, 240_000);
});
