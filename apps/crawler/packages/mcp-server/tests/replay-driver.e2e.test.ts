import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { birthDateFor } from '@pathfinder/model';
import { startReferencePortal, TODAY, type ReferencePortal } from '@pathfinder/reference-portal';
import {
  importMinedRule,
  judgeReplays,
  loadObservationTables,
  pendingReplays,
  recordReplay,
} from '@pathfinder/store';
import { replay, type ReplayPlan } from '../src/replay-driver.js';
import { startHarness } from './harness.js';

/**
 * The headless driver end to end (spec 039 design § 9, § 11.5) on the reference portal's driver
 * form (drivers under 18 are refused): replays with four birth dates make the decision point,
 * a rule "under 18" is imported as the miner would write it, and its boundary tests at 17, 18
 * and 19 replay the recorded path with no LLM. The portal follows the rule, so it is supported.
 */
const available = await canLaunchBrowser();

// The submit carries no evidence of being read-only: the persona's limit lets the driver press it.
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: mutating\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

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

const DRIVER_PAGE =
  '/kalkulator/kierowca?marka=toyota&model=Corolla&rok_produkcji=2018&pojemnosc=1600&kod_pocztowy=00-001';
const AGE = 'derived.input.data_urodzenia.age_years';

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

/** The element key of the driver form's "Dalej", as a replay run lists it. */
async function nextKey(): Promise<string> {
  const start = await h.call('start_run', {
    portal_id: 'reference-insurer',
    persona_id: 'guest',
    replay: { inputs: {} },
  });
  expect(start.isError, JSON.stringify(start.body)).toBeFalsy();
  const runId = start.body.run_id as string;
  const page = await h.call('navigate', {
    run_id: runId,
    url: new URL(DRIVER_PAGE, portal.url).href,
    rationale: 'find the submit',
    include_actions: true,
  });
  const actions = page.body.actions as { accessible_name: string | null; element_key?: string }[];
  await h.call('finish_run', { run_id: runId, rationale: 'looked' });
  return actions.find((a) => a.accessible_name === 'Dalej')!.element_key!;
}

describe.skipIf(!available)('the headless driver (spec 039 T021)', () => {
  it('replays the boundary tests of a decision rule and supports the rule the portal follows', async () => {
    const key = await nextKey();
    const plan = (birth: string): ReplayPlan => ({
      portal: 'reference-insurer',
      persona: 'guest',
      environment: 'sandbox',
      startUrl: new URL(DRIVER_PAGE, portal.url).href,
      steps: [key],
      inputs: { 'input.data_urodzenia': birth },
      purpose: 'decision point data',
    });
    for (const age of [16, 17, 30, 45]) {
      const r = await replay(h.call, plan(birthDateFor(age, TODAY)));
      expect(r.status, JSON.stringify(r)).toBe('reached');
    }
    const raw = h.ctx.raw;
    const drivers = raw.prepare('SELECT DISTINCT driver FROM edges').all();
    expect(drivers).toEqual([{ driver: 'headless' }]);

    const tables = loadObservationTables(raw, 'reference-insurer');
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    // Rows by the typed date: the table counts ages from the capture day, the portal from its own
    // fixed day (F-20).
    const targetOf = (age: number) => {
      const row = table.rows.find(
        (r) => r.features['input.data_urodzenia'] === birthDateFor(age, TODAY),
      );
      expect(row, JSON.stringify(table.rows)).toBeDefined();
      return row!.target;
    };
    expect(targetOf(16)).not.toBe(targetOf(30));
    // The reconciler already noted the decision point (R7); the rule is the next hypothesis.
    const rule = importMinedRule(raw, 'reference-insurer', table, {
      decisionPoint: { screen: table.decision_point.screen, action: key },
      hitPolicy: 'U',
      inputs: [{ name: AGE, type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { [AGE]: '< 18' }, then: targetOf(16) },
        { when: { [AGE]: '>= 18' }, then: targetOf(30) },
      ],
      fitness: 1,
      precision: 1,
      rows: table.rows.length,
    });
    expect(rule).toMatch(/^H-\d{4}$/);

    const plans = pendingReplays(raw, 'reference-insurer', { today: TODAY });
    expect(plans).toHaveLength(3);
    for (const p of plans) recordReplay(raw, p.testId, await replay(h.call, p));
    expect(judgeReplays(raw, 'reference-insurer')).toEqual([{ hypothesis: rule, to: 'supported' }]);
    const verdicts = raw.prepare('SELECT verdict FROM hypothesis_tests').all();
    expect(verdicts).toEqual([{ verdict: 'pass' }, { verdict: 'pass' }, { verdict: 'pass' }]);
  }, 180_000);
});
