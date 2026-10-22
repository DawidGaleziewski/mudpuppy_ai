import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import {
  FAILING_MODEL,
  startReferencePortal,
  type ReferencePortal,
} from '@mudpuppy/reference-portal';
import { replay, type ReplayPlan } from '../src/replay-driver.js';
import { replayPortal } from '../src/replay-portal.js';
import { startHarness } from './harness.js';

/**
 * Rule R1 on the headless driver (spec 039 design § 8.2, scenario deterministic-error): the
 * vehicle form submits fine for one model and answers HTTP 500 for another. The second run is a
 * deviation the reconciler cannot explain from stored evidence, so it waits for replays; two
 * replays fail the same way, so it is a deterministic error, waiting for a person.
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
  portal = await startReferencePortal({
    host: '127.0.0.1',
    port: 0,
    scenarios: ['deterministic-error'],
  });
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

describe.skipIf(!available)('rule R1 on the headless driver (spec 039 T052)', () => {
  it('an error that every replay repeats is a deterministic error, for a person', async () => {
    const key = await nextKey();
    const plan = (model: string): ReplayPlan => ({
      portal: 'reference-insurer',
      persona: 'guest',
      environment: 'sandbox',
      startUrl: new URL('/kalkulator/pojazd', portal.url).href,
      steps: [key],
      inputs: { 'input.model': model },
      purpose: 'deterministic-error scenario',
    });
    const raw = h.ctx.raw;
    const resultOf = (transitionId: string | null) =>
      (
        raw.prepare('SELECT result FROM transitions WHERE id = ?').get(transitionId) as {
          result: string;
        }
      ).result;
    const ok = await replay(h.call, plan('Corolla'));
    expect(ok.status === 'reached' && resultOf(ok.transitionId)).toBe('ok');
    const broken = await replay(h.call, plan(FAILING_MODEL));
    expect(broken.status === 'reached' && resultOf(broken.transitionId)).toBe('technical_error');

    const waiting = raw
      .prepare(
        "SELECT kind, status FROM deviations WHERE json_extract(after_json, '$.result') = 'technical_error'",
      )
      .all() as { kind: string; status: string }[];
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.kind).toMatch(/_mismatch$/);
    expect(waiting[0]!.status).toBe('waiting_test');

    const report = await replayPortal(h.call, raw, 'reference-insurer');
    expect(report.replays).toBe(2);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.results).toEqual(['technical_error', 'technical_error']);
    const h1 = raw
      .prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?')
      .get(report.errors[0]!.hypothesis);
    expect(h1).toEqual({ kind: 'deterministic_error', rule: 'R1', derived: 0 });
    const after = raw
      .prepare(
        "SELECT status FROM deviations WHERE json_extract(after_json, '$.result') = 'technical_error'",
      )
      .get();
    expect(after).toEqual({ status: 'open' });
    // Nothing waits any more: a second call replays nothing.
    expect((await replayPortal(h.call, raw, 'reference-insurer')).replays).toBe(0);
  }, 180_000);
});
