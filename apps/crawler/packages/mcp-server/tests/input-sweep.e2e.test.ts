import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startReferencePortal, type ReferencePortal } from '@mudpuppy/reference-portal';
import { pendingSweeps } from '@mudpuppy/store';
import { sweepPortal } from '../src/sweep-portal.js';
import { startHarness, type Body, type Call } from './harness.js';

/**
 * Spec 080 FR-003 (R-97 (4), R05 of the reference ground truth): one scan types one engine size, so
 * the engine factor's bands are never seen. After a walk through the calculator, the input sweep
 * replays it over the engine field's range and finds both edges: 1400 → 1401 and 2000 → 2001.
 */
const available = await canLaunchBrowser();

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
  max_run_time_minutes: 10
  max_steps: 20
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (local reference portal)" }
`;

const GUEST = `id: guest
max_action_class: external-side-effect
viewport: { width: 1280, height: 800 }
locale: pl-PL
auth: none
test_data:
  Marka: Toyota
  Model: Testowy
  Rok produkcji: "2020"
  Pojemność silnika (cm³): "1600"
  Kod pocztowy: 00-950
  Data urodzenia: "1990-01-01"
  Rok uzyskania prawa jazdy: "2010"
  Lata bezszkodowej jazdy: "6"
`;

let portal: ReferencePortal;
beforeAll(async () => {
  if (available) portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
});
afterAll(async () => portal?.close());

const press = async (call: Call, run: string, page: Body, name: string): Promise<Body> => {
  // The button: the menu has a link "Oblicz składkę" to the calculator's start too.
  const action = (page.actions as Body[]).find(
    (a) => a.accessible_name === name && a.role === 'button',
  );
  if (!action) throw new Error(`no ${name} on ${String(page.route_template)}`);
  const r = await call('act', {
    run_id: run,
    action_id: action.action_id,
    rationale: 'walk the calculator',
    include_actions: true,
  });
  if (r.isError) throw new Error(JSON.stringify(r.body).slice(0, 300));
  return r.body;
};

describe.skipIf(!available)('input sweep on the reference calculator (spec 080)', () => {
  it("finds the engine factor's two band edges", async () => {
    const h = await startHarness({
      'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
      'personas/reference-insurer/guest.yaml': GUEST,
    });
    try {
      const start = await h.call('start_run', {
        portal_id: 'reference-insurer',
        persona_id: 'guest',
      });
      const run = start.body.run_id as string;
      const vehicle = await h.call('navigate', {
        run_id: run,
        url: `${portal.url.replace(/\/$/, '')}/kalkulator/pojazd`,
        rationale: 'the calculator',
        include_actions: true,
      });
      const driver = await press(h.call, run, vehicle.body, 'Dalej');
      const options = await press(h.call, run, driver, 'Dalej');
      const result = await press(h.call, run, options, 'Oblicz składkę');
      expect(result.route_template).toBe('/kalkulator/wynik');

      const raw = h.ctx.raw;
      const plans = pendingSweeps(raw, 'reference-insurer');
      const engine = plans.find((p) => p.label === 'Pojemność silnika (cm³)');
      expect(engine).toMatchObject({ min: 50, max: 8000 });

      const report = await sweepPortal(h.call, raw, 'reference-insurer', { limit: 60 });
      const bands = report.sweeps.find((s) => s.label === 'Pojemność silnika (cm³)')!.bands;
      expect(bands.map((b) => [b.below, b.above])).toEqual([
        [1400, 1401],
        [2000, 2001],
      ]);
      const notes = raw
        .prepare("SELECT reason FROM decision_log WHERE rule = 'input_band'")
        .all() as { reason: string }[];
      expect(notes.some((n) => n.reason.startsWith('"Pojemność silnika (cm³)" 1400 → 1401'))).toBe(
        true,
      );
    } finally {
      await h.cleanup();
    }
  }, 600_000);
});
