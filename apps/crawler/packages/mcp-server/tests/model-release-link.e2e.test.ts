import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startReferencePortal, type ReferencePortal } from '@mudpuppy/reference-portal';
import { startHarness } from './harness.js';

/**
 * Found by the R-32 acceptance run (spec 047 F-02): after a release, a home page link leads to a
 * changed calculator step. The second scan visits the home page more than once, and the rules
 * compared its latest visit with its own earlier one: the same release, so the new target read as
 * a decision point (R7, for a person). The reference is now an earlier run's visit: the build
 * changed, structural drift by R2, derived.
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

/** Open the home page `homeVisits` times, then follow its "Oblicz składkę OC/AC" link. */
async function scan(homeVisits: number): Promise<void> {
  const start = await h.call('start_run', { portal_id: 'reference-insurer', persona_id: 'guest' });
  const runId = start.body.run_id as string;
  let page = { body: {} as Record<string, unknown>, isError: false };
  for (let i = 0; i < homeVisits; i++)
    page = await h.call('navigate', {
      run_id: runId,
      url: new URL('/', portal.url).href,
      rationale: 'release link scenario',
      include_actions: true,
    });
  const actions = page.body.actions as { action_id: string; accessible_name: string | null }[];
  const link = actions.find((a) => a.accessible_name === 'Oblicz składkę OC/AC')!;
  const r = await h.call('act', { run_id: runId, action_id: link.action_id, rationale: 'follow' });
  expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
  await h.call('finish_run', { run_id: runId, rationale: 'done' });
}

describe.skipIf(!available)('a release behind a link (spec 047 F-02)', () => {
  it('the changed target of a home page link is structural drift, not a decision point', async () => {
    await scan(1);
    await portal.close();
    portal = await startReferencePortal({
      host: '127.0.0.1',
      port: 0,
      scenarios: ['deployment', 'renamed-button'],
    });
    writeFileSync(
      join(h.ctx.root, 'portals/reference-insurer/portal.yaml'),
      portalYaml(portal.url.replace(/\/$/, '')),
    );
    await scan(2); // the home page twice: its own earlier visit has the new release too
    const raw = h.ctx.raw;
    const rows = raw
      .prepare(
        `SELECT d.kind AS deviation, h.kind, h.rule FROM deviations d
         LEFT JOIN hypotheses h ON h.deviation_id = d.id ORDER BY d.kind`,
      )
      .all() as { deviation: string; kind: string | null; rule: string | null }[];
    expect(rows.filter((r) => r.kind === 'decision_point')).toEqual([]);
    const targets = rows.filter((r) => r.deviation === 'target_mismatch');
    for (const t of targets) expect(t).toMatchObject({ kind: 'structural_drift', rule: 'R2' });
  }, 180_000);
});
