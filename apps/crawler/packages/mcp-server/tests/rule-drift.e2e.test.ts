import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { birthDateFor } from '@pathfinder/model';
import { startReferencePortal, TODAY, type ReferencePortal } from '@pathfinder/reference-portal';
import {
  decideHypothesis,
  hypothesisEvents,
  importMinedRule,
  loadObservationTables,
} from '@pathfinder/store';
import { replay, type ReplayPlan } from '../src/replay-driver.js';
import { replayPortal } from '../src/replay-portal.js';
import { startHarness } from './harness.js';

/**
 * Decision drift end to end (spec 039 design § 11.6; scenario rule-drift): the rule "drivers
 * under 18 are refused" is mined, tested and confirmed; a release raises the age to 21. The
 * release on the decision screen queues the rule's regression suite, the test at 18 fails, R8
 * replays it once, the mismatch reproduces: decision drift, derived, and the rule is superseded.
 * The release keeps the port: replays start from the recorded URLs.
 */
const available = await canLaunchBrowser();

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

async function nextKey(): Promise<string> {
  const start = await h.call('start_run', {
    portal_id: 'reference-insurer',
    persona_id: 'guest',
    replay: { inputs: {} },
  });
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

const statusOf = (key: string) =>
  hypothesisEvents(
    h.ctx.raw,
    (h.ctx.raw.prepare('SELECT id FROM hypotheses WHERE key = ?').get(key) as { id: string }).id,
  ).at(-1)!.to;

describe.skipIf(!available)('decision drift (spec 039 T063, scenario rule-drift)', () => {
  it('a release that moves the threshold supersedes the confirmed rule by R8', async () => {
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
    for (const age of [16, 17, 30, 45]) await replay(h.call, plan(birthDateFor(age, TODAY)));
    const raw = h.ctx.raw;
    const [table] = loadObservationTables(raw, 'reference-insurer');
    const targetOf = (age: number) =>
      table!.rows.find((r) => r.features['input.data_urodzenia'] === birthDateFor(age, TODAY))!
        .target;
    const rule = importMinedRule(raw, 'reference-insurer', table!, {
      decisionPoint: { screen: table!.decision_point.screen, action: key },
      hitPolicy: 'U',
      inputs: [{ name: AGE, type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { [AGE]: '< 18' }, then: targetOf(16) },
        { when: { [AGE]: '>= 18' }, then: targetOf(30) },
      ],
      fitness: 1,
      precision: 1,
      rows: table!.rows.length,
    })!;
    const tested = await replayPortal(h.call, raw, 'reference-insurer', { today: TODAY });
    expect(tested.moves).toEqual([{ hypothesis: rule, to: 'supported' }]);
    decideHypothesis(raw, {
      portal: 'reference-insurer',
      key: rule,
      decision: 'confirm',
      actor: 'owner',
      reason: 'the terms say 18',
    });

    // The release, on the same port.
    const port = new URL(portal.url).port;
    await portal.close();
    portal = await startReferencePortal({
      host: '127.0.0.1',
      port: Number(port),
      scenarios: ['rule-drift'],
    });
    await replay(h.call, { ...plan(birthDateFor(45, TODAY)), purpose: 'a scan after the release' });

    const drift = await replayPortal(h.call, raw, 'reference-insurer', { today: TODAY });
    expect(drift.regressions).toEqual([rule]);
    expect(drift.tests).toBe(3);
    expect(drift.mismatches).toHaveLength(1);
    const h8 = raw
      .prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?')
      .get(drift.mismatches[0]!.hypothesis);
    expect(h8).toEqual({ kind: 'decision_drift', rule: 'R8', derived: 1 });
    expect(statusOf(rule)).toBe('superseded');
  }, 240_000);
});
