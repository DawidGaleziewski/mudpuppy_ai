import { afterEach, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startReferencePortal, type ReferencePortal } from '@pathfinder/reference-portal';
import { crawl, startHarness, type Body, type Call } from './harness.js';
import { makeCtx } from './helpers.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { normaliseRows } from './trace-normalise.js';
import { portalYaml as mockPortalYaml } from './trace-run-harness.js';

/**
 * Behaviour lock for the pipeline split (spec 012 T031, SC-005): a map run and a trace run with
 * the real browser runtime, snapshotting what the pipeline records — states, actions, edges, the
 * decision log in order and the trace span tree. Ids, hashes, times, durations and the random
 * port are normalised; screenshots are reduced to "present" (PNG bytes are not stable).
 */
const available = await canLaunchBrowser();

type Row = Record<string, unknown>;
type Ctx = Awaited<ReturnType<typeof makeCtx>>;

const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const portals: { close(): Promise<void> }[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const p of portals.splice(0)) await p.close();
});

/** Everything the pipeline wrote for one run, in insertion order, normalised. */
function recorded(ctx: Ctx, runId: string, origin: string): Row[] {
  const all = (sql: string) => ctx.raw.prepare(sql).all(runId) as Row[];
  const out = {
    states: all(
      `SELECT s.id, s.route_template, s.title, s.fingerprint, s.cluster_id, s.evidence_ref,
              s.confidence, s.stabilization, s.screenshot_ref IS NOT NULL AS screenshot
         FROM states s WHERE s.first_seen_run = ? ORDER BY s.rowid`,
    ),
    actions: all(
      `SELECT id, state_id, role, accessible_name, safety_class, allowed, skip_reason
         FROM actions WHERE run_id = ? ORDER BY rowid`,
    ),
    edges: all(
      `SELECT from_state, to_state, json_extract(action_json, '$.role') AS role,
              json_extract(action_json, '$.accessible_name') AS name, safety_class, status,
              confidence, error, stabilization
         FROM edges WHERE run_id = ? ORDER BY rowid`,
    ),
    frontier: all(
      `SELECT state_id, action_id, status, reason FROM frontier WHERE run_id = ? ORDER BY rowid`,
    ),
    decisions: all(
      `SELECT kind, rule, reason, subject_ref, detail_json FROM decision_log
        WHERE run_id = ? ORDER BY rowid`,
    ),
    spans: all(
      `SELECT id, parent_id, kind, name, status, attrs_json, summary, decision_id IS NOT NULL AS
              decision, between_calls
         FROM trace_spans WHERE run_id = ? ORDER BY seq`,
    ),
  };
  for (const span of out.spans)
    span.attrs_json = withoutTimings(JSON.parse(String(span.attrs_json)));
  const host = new URL(origin).host;
  const text = JSON.stringify([out]).replaceAll(origin, '<origin>').replaceAll(host, '<host>');
  return normaliseRows(JSON.parse(text) as Row[]);
}

/** Wall-clock attributes (`elapsed_ms`, `limiter_wait_ms_total`, …) differ on every run. */
function withoutTimings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimings);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      typeof v === 'number' && /_ms(_total)?$/.test(k) ? '<ms>' : withoutTimings(v),
    ]),
  );
}

async function mapRun(): Promise<Row[]> {
  const mock: MockPortal = await startMockPortal();
  portals.push(mock);
  const h = await startHarness({
    'portals/mock/portal.yaml': mockPortalYaml(mock.origin, 40),
    'personas/mock/guest.yaml': PERSONA,
  });
  cleanups.push(h.cleanup);
  const start = await h.call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  const runId = start.body.run_id as string;
  await h.call('navigate', { run_id: runId, url: `${mock.origin}/`, rationale: 'home' });
  await crawl(h.call, runId, 40);
  await h.call('finish_run', { run_id: runId, rationale: 'frontier exhausted' });
  return recorded(h.ctx, runId, mock.origin);
}

const refPortalYaml = (origin: string) => `
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
  max_depth: 6
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 80
denylist: ["path:/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
`;

const STEPS: [kind: 'fill' | 'click', role: string, name: string, value?: string][] = [
  ['fill', 'combobox', 'Marka', 'skoda'],
  ['fill', 'textbox', 'Model', 'Octavia'],
  ['fill', 'spinbutton', 'Rok produkcji', '2018'],
  ['fill', 'spinbutton', 'Pojemność silnika (cm³)', '1600'],
  ['fill', 'textbox', 'Kod pocztowy', '00-950'],
  ['click', 'button', 'Dalej'],
  ['fill', 'textbox', 'Data urodzenia', '1986-01-01'],
  ['fill', 'spinbutton', 'Rok uzyskania prawa jazdy', '2005'],
  ['fill', 'spinbutton', 'Lata bezszkodowej jazdy', '6'],
  ['click', 'checkbox', 'Zgoda na przetwarzanie danych osobowych'],
  ['click', 'checkbox', 'Oświadczam, że zapoznałem się z OWU'],
  ['click', 'button', 'Dalej'],
  ['click', 'button', 'Oblicz składkę'],
];

const must =
  (call: Call) =>
  async (name: string, args: Record<string, unknown>): Promise<Body> => {
    const r = await call(name, args);
    if (r.isError) throw new Error(`${name} refused: ${JSON.stringify(r.body)}`);
    return r.body;
  };

async function traceRun(): Promise<Row[]> {
  const portal: ReferencePortal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  portals.push(portal);
  const origin = portal.url.replace(/\/$/, '');
  const h = await startHarness({
    'portals/reference-insurer/portal.yaml': refPortalYaml(origin),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
  cleanups.push(h.cleanup);
  const ok = must(h.call);
  const start = await ok('start_run', {
    portal_id: 'reference-insurer',
    persona_id: 'guest',
    mode: 'trace',
    process: { name: 'Oblicz składkę OC/AC', goal: 'See the yearly premium for a car' },
  });
  const runId = start.run_id as string;
  let page = await ok('navigate', {
    run_id: runId,
    url: `${origin}/kalkulator/pojazd`,
    intent: 'Open the car insurance calculator',
    rationale: 'trace start',
  });
  for (const [kind, role, name, value] of STEPS) {
    const action = (page.actions as Body[]).find(
      (a) => a.role === role && a.accessible_name === name,
    );
    if (!action) throw new Error(`no ${role} "${name}" on ${page.route_template}`);
    page = await ok('act', {
      run_id: runId,
      action_id: action.action_id,
      ...(kind === 'fill' ? { value } : {}),
      intent: `${kind} ${name}`,
      rationale: 'trace step',
    });
  }
  await ok('finish_run', {
    run_id: runId,
    outcome: 'goal_reached',
    observed_result: 'The result page shows the yearly premium.',
    rationale: 'goal reached',
  });
  return recorded(h.ctx, runId, origin);
}

describe.skipIf(!available)('pipeline golden behaviour lock (spec 012 SC-005)', () => {
  it('a map run on the mock portal records the committed states, edges, decisions and spans', async () => {
    const rows = await mapRun();
    await expect(JSON.stringify(rows, null, 2) + '\n').toMatchFileSnapshot(
      '__snapshots__/pipeline-golden-map.json',
    );
  }, 120_000);

  it('a trace run on the reference portal records the committed steps, decisions and spans', async () => {
    const rows = await traceRun();
    await expect(JSON.stringify(rows, null, 2) + '\n').toMatchFileSnapshot(
      '__snapshots__/pipeline-golden-trace.json',
    );
  }, 120_000);
});
