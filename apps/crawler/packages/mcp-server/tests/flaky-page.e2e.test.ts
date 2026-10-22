import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startReferencePortal, type ReferencePortal } from '@mudpuppy/reference-portal';
import { replay, type ReplayPlan } from '../src/replay-driver.js';
import { replayPortal } from '../src/replay-portal.js';
import { startHarness } from './harness.js';

/**
 * Scenario flaky-page (spec 039 design § 19.1, spec 040 T036): the vehicle form's submit answers
 * HTTP 500 on the 2nd to 4th of every five loads of the same address. A run that hit it is a
 * deviation waiting for replays; rule R1 replays the step twice, both succeed: flaky, derived,
 * and the deviation is explained without a person.
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
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (local reference portal)" }
`;

let portal: ReferencePortal;
let h: Awaited<ReturnType<typeof startHarness>>;

beforeAll(async () => {
  if (!available) return;
  portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: ['flaky-page'] });
  h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
});

afterAll(async () => {
  await h?.cleanup();
  await portal?.close();
});

/** The element key of the vehicle form's "Dalej", as a probe run lists it. */
async function nextKey(): Promise<string> {
  const start = await h.call('start_run', {
    portal_id: 'reference-insurer',
    persona_id: 'guest',
    mode: 'probe',
    replay: { inputs: {} },
  });
  const runId = start.body.run_id as string;
  const page = await h.call('navigate', {
    run_id: runId,
    url: new URL('/kalkulator/pojazd', portal.url).href,
    rationale: 'find the submit',
    include_actions: true,
  });
  const actions = page.body.actions as { accessible_name: string | null; element_key?: string }[];
  await h.call('finish_run', { run_id: runId, rationale: 'looked' });
  return actions.find((a) => a.accessible_name === 'Dalej')!.element_key!;
}

describe.skipIf(!available)('scenario flaky-page (spec 040 T036)', () => {
  it('an error the replays do not repeat is flaky, derived, and explained', async () => {
    const key = await nextKey();
    const plan: ReplayPlan = {
      portal: 'reference-insurer',
      persona: 'guest',
      environment: 'sandbox',
      startUrl: new URL('/kalkulator/pojazd', portal.url).href,
      steps: [key],
      inputs: { 'input.model': 'Corolla' },
      purpose: 'flaky-page scenario',
    };
    const raw = h.ctx.raw;
    const resultOf = (transitionId: string | null) =>
      (
        raw.prepare('SELECT result FROM transitions WHERE id = ?').get(transitionId) as {
          result: string;
        }
      ).result;
    const first = await replay(h.call, plan); // load 0 of the submit: fine
    expect(first.status === 'reached' && resultOf(first.transitionId)).toBe('ok');
    // Loads 1 to 3: the injected HTTP 500 and the crawler's two re-opens of the error page.
    const second = await replay(h.call, plan);
    expect(second.status === 'reached' && resultOf(second.transitionId)).toBe('technical_error');
    const waiting = raw
      .prepare(
        "SELECT id, status FROM deviations WHERE json_extract(after_json, '$.result') = 'technical_error'",
      )
      .all() as { id: string; status: string }[];
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.status).toBe('waiting_test');

    const report = await replayPortal(h.call, raw, 'reference-insurer');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.results).toEqual(['ok', 'ok']); // loads 4 and 5
    const h1 = raw
      .prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?')
      .get(report.errors[0]!.hypothesis);
    expect(h1).toEqual({ kind: 'flaky', rule: 'R1', derived: 1 });
    const after = raw.prepare('SELECT status FROM deviations WHERE id = ?').get(waiting[0]!.id);
    expect(after).toEqual({ status: 'explained' });
  }, 180_000);
});
