import { describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startReferencePortal, type ScenarioId } from '@pathfinder/reference-portal';
import { startHarness } from './harness.js';

/**
 * The portal model's structure on two M2 scenarios (spec 039 design § 6, § 19.1): repeated rows
 * ("add another driver" adds a row) stay one screen and stop adding page versions once rows
 * collapse; six numbered sections with different forms are six screens, their path parameter an
 * identity parameter. Replay runs that only look (headless, no LLM).
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
  max_steps: 10
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
`;

async function setup(scenario: ScenarioId) {
  const portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: [scenario] });
  const h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
  /** One replay run that opens each path in turn. */
  const look = async (paths: readonly string[]) => {
    const start = await h.call('start_run', {
      portal_id: 'reference-insurer',
      persona_id: 'guest',
      replay: { inputs: {} },
    });
    expect(start.isError, JSON.stringify(start.body)).toBeFalsy();
    const runId = start.body.run_id as string;
    for (const p of paths) {
      const r = await h.call('navigate', {
        run_id: runId,
        url: new URL(p, portal.url).href,
        rationale: 'look',
      });
      expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
    }
    await h.call('finish_run', { run_id: runId, rationale: 'looked' });
  };
  const close = async () => {
    await h.cleanup();
    await portal.close();
  };
  return { h, look, close };
}

const screensOn = (h: Awaited<ReturnType<typeof startHarness>>, route: string) =>
  h.ctx.raw
    .prepare(
      `SELECT s.key, s.route_key, count(m.state_id) AS members FROM model_screens s
       JOIN screen_members m ON m.screen_id = s.id AND m.to_model_version IS NULL
       WHERE s.status = 'active' AND s.route_key LIKE ? GROUP BY s.id ORDER BY s.route_key`,
    )
    .all(`${route}%`) as { key: string; route_key: string; members: number }[];

describe.skipIf(!available)('portal model structure (spec 039 T041)', () => {
  it('repeated rows are one screen; more rows add no page versions once they collapse', async () => {
    const s = await setup('repeated-rows');
    try {
      await s.look(['/kierowcy?n=1', '/kierowcy?n=2']);
      const two = screensOn(s.h, '/kierowcy');
      await s.look(['/kierowcy?n=3', '/kierowcy?n=5', '/kierowcy?n=6']);
      const six = screensOn(s.h, '/kierowcy');
      expect(six, JSON.stringify(six)).toHaveLength(1);
      expect(six[0]!.members).toBe(two[0]!.members);
      const role = s.h.ctx.raw
        .prepare(
          "SELECT role FROM parameter_roles WHERE route_template = '/kierowcy' AND param = 'query:n'",
        )
        .get();
      expect(role).toEqual({ role: 'data' });
    } finally {
      await s.close();
    }
  }, 120_000);

  it('six numbered sections with different forms are six screens; the number is identity', async () => {
    const s = await setup('numbered-sections');
    try {
      // Identity needs each value seen twice (design § 6.4): two scans of the six sections.
      const all = [1, 2, 3, 4, 5, 6].map((n) => `/sekcja/${n}`);
      await s.look(all);
      await s.look(all);
      const sections = screensOn(s.h, '/sekcja');
      expect(
        sections.map((x) => x.route_key),
        JSON.stringify(sections),
      ).toEqual(['/sekcja/1', '/sekcja/2', '/sekcja/3', '/sekcja/4', '/sekcja/5', '/sekcja/6']);
      const roles = s.h.ctx.raw
        .prepare(
          "SELECT route_template, param, role FROM parameter_roles WHERE route_template LIKE '/sekcja%'",
        )
        .all();
      expect(roles).toEqual([
        { route_template: '/sekcja/:param', param: 'path:2', role: 'identity' },
      ]);
    } finally {
      await s.close();
    }
  }, 120_000);
});
