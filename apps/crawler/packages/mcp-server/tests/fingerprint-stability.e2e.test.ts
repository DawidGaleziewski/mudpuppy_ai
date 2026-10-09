import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import {
  loadGroundTruth,
  startReferencePortal,
  type ReferencePortal,
} from '@pathfinder/reference-portal';
import { startHarness } from './harness.js';

/**
 * Fingerprint lock (spec 015 T007, FR-005, SC-006): pages without frames or role-less clickables
 * must keep the fingerprint they had before spec 015 changed how pages are observed, or every
 * stored state of an existing portal stops being recognised. The snapshot was written before any
 * observer change; it must never be updated to make a spec 015 change pass.
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
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: 50
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 80
denylist: ["path:/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
`;

let portal: ReferencePortal;
let h: Awaited<ReturnType<typeof startHarness>>;

beforeAll(async () => {
  if (!available) return;
  portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  const origin = portal.url.replace(/\/$/, '');
  h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(origin),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
});

afterAll(async () => {
  await h?.cleanup();
  await portal?.close();
});

describe.skipIf(!available)('fingerprints of frame-less pages', () => {
  it('match the pre-spec-015 fingerprints of the reference portal screens', async () => {
    const screens = loadGroundTruth().screens.filter((s) => !s.route_template.includes(':'));
    expect(screens.length).toBeGreaterThan(5);
    const start = await h.call('start_run', {
      portal_id: 'reference-insurer',
      persona_id: 'guest',
    });
    const runId = start.body.run_id as string;
    const fingerprints: Record<string, string> = {};
    for (const s of screens) {
      const r = await h.call('navigate', {
        run_id: runId,
        url: new URL(s.route_template, portal.url).href,
        rationale: 'fingerprint lock',
      });
      expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
      const row = h.ctx.raw
        .prepare('SELECT fingerprint, route_template FROM states WHERE id = ?')
        .get(r.body.state_id) as { fingerprint: string; route_template: string };
      fingerprints[`${s.id} ${row.route_template}`] = row.fingerprint;
    }
    expect(fingerprints).toMatchSnapshot();
  }, 120_000);
});
