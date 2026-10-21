import { afterAll, beforeAll, expect } from 'vitest';
import { reconcilePortalModel } from '@pathfinder/store';
import {
  actOn,
  gate,
  gateServer,
  markForProbing,
  resetScars,
  scarNav,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * One button, two pages (SC-20, spec 039 design § 9): the same button of SC-20 led to the offer in
 * one scan and to the sold-out page in the next, so the portal model records one
 * `target_mismatch` deviation for that button, a decision point (R7) left to rule mining and a
 * person. SC-19's probes typed other values into the form; each of their outcomes is a decision
 * point too, never an unexplained mismatch.
 */
const PORTAL = 'scar-maker';
let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await gs?.close();
});

/** What `finish_run` does at the end of a scan; the gate's scans leave their frontier open. */
const reconcile = () => reconcilePortalModel(gs.ctx.raw, PORTAL);

interface Mismatch {
  /** The action's element key (lower case). */
  element: string;
  from: string;
  before: string;
  after: string;
  /** Kinds of the hypotheses the reconciler wrote for it. */
  explained: string[];
}

/** Target mismatches of the model, with the routes of the screens they name. */
function mismatches(): Mismatch[] {
  const route = gs.ctx.raw.prepare('SELECT route_key FROM model_screens WHERE id = ?');
  const routeOf = (id: string) =>
    (route.get(id) as { route_key: string } | undefined)?.route_key ?? '';
  const rows = gs.ctx.raw
    .prepare(
      `SELECT a.element_key, d.screen_id, d.before_json, d.after_json,
         (SELECT group_concat(h.kind) FROM hypotheses h WHERE h.deviation_id = d.id) AS kinds
       FROM deviations d JOIN action_classes a ON a.id = d.action_class_id
       WHERE d.portal_id = ? AND d.kind = 'target_mismatch'`,
    )
    .all(PORTAL) as {
    element_key: string;
    screen_id: string;
    before_json: string;
    after_json: string;
    kinds: string | null;
  }[];
  const toScreen = (json: string) => (JSON.parse(json) as { toScreen: string }).toScreen;
  return rows.map((r) => ({
    element: r.element_key,
    from: routeOf(r.screen_id),
    before: routeOf(toScreen(r.before_json)),
    after: routeOf(toScreen(r.after_json)),
    explained: r.kinds ? r.kinds.split(',') : [],
  }));
}

gate('SC-20', 'one button, two pages in two scans: one target mismatch', async () => {
  for (const scan of [1, 2]) {
    const run = await startRun(gs.call, PORTAL, 'quote-tester');
    const home = await scarNav(gs.call, run, '/sc20/');
    await actOn(gs.call, run, home, 'See the offer', { intent: `scan ${scan}` });
    reconcile();
  }
  const offer = mismatches().filter((m) => m.element.startsWith('button|see the offer|'));
  expect(offer).toHaveLength(1);
  expect([offer[0]!.before, offer[0]!.after].sort()).toEqual(['/sc20/offer', '/sc20/sold-out']);
  // Same release and audience: R7 makes it a decision point, for mining and a person.
  expect(offer[0]!.explained).toEqual(['decision_point']);
});

gate('SC-20', 'probe outcomes are decision points, not unexplained mismatches', async () => {
  const map = await startRun(gs.call, PORTAL, 'quote-tester');
  const step1 = await scarNav(gs.call, map, '/sc19/apply');
  await actOn(gs.call, map, step1, 'Next', { intent: 'go to step 2' });
  reconcile();
  markForProbing(gs, PORTAL, step1.route_template as string);
  const probe = await startRun(gs.call, PORTAL, 'quote-tester', { form_probing: true });
  const page = await scarNav(gs.call, probe, '/sc19/apply');
  await gs.call('probe_form', {
    run_id: probe,
    action_id: (page.actions as { accessible_name: string; action_id: string }[]).find(
      (a) => a.accessible_name === 'Next',
    )!.action_id,
    probes: ['validation'],
    rationale: 'gate: probe outcomes are decision points',
  });
  reconcile();
  const form = mismatches().filter((m) => m.from.startsWith('/sc19'));
  expect(form.length).toBeGreaterThan(0);
  expect(form.filter((m) => !m.explained.includes('decision_point'))).toEqual([]);
});
