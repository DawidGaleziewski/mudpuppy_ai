import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  gate,
  gateServer,
  resetScars,
  rows,
  scarNav,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Steps of a form rendered by script on one URL (SC-19, owner 2026-10-16, spec 032 US1): each step
 * is its own numbered form step, a refused step is a `validation` state of that step (not a new
 * revision of the screen, F-02@032), and an item of step 2 is still reachable while the browser
 * shows another state (F-01@032: the URL alone shows step 1).
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

interface StateRow {
  id: string;
  form_step_id: string | null;
  state_kind: string;
}
const stateOf = (id: string): StateRow =>
  rows<StateRow>(gs, 'SELECT id, form_step_id, state_kind FROM states WHERE id = ?', id)[0]!;

gate('SC-19', 'same-URL form steps are numbered, refused steps are validation states', async () => {
  const run = await startRun(gs.call, PORTAL, 'applicant');
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  // Map mode fills the form before Next (autofill): step 1 passes the browser's checks.
  const step2 = await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
  // Autofill types "Test" as the promo code: the quote API refuses it with a field message.
  const refused = await actOn(gs.call, run, step2, 'Next', { intent: 'ask for a quote' });
  // An item of step 2 while the browser is on the refused state: back along the run's own way.
  const business = await actOn(gs.call, run, step2, 'Business', { intent: 'choose Business' });

  const steps = rows<{ id: string; step_index: number; label: string; controls_json: string }>(
    gs,
    "SELECT id, step_index, label, controls_json FROM form_steps WHERE route_template = '/sc19/apply' ORDER BY step_index",
  );
  expect(steps.map((s) => [s.step_index, s.label])).toEqual([
    [1, 'Your details'],
    [2, 'Your contract'],
  ]);
  const [s1, s2] = [stateOf(step1.state_id as string), stateOf(step2.state_id as string)];
  expect([s1.form_step_id, s2.form_step_id]).toEqual([steps[0]!.id, steps[1]!.id]);
  expect(stateOf(refused.state_id as string)).toMatchObject({
    form_step_id: steps[1]!.id,
    state_kind: 'validation',
  });
  // Business reveals fields: still step 2, which now knows them.
  expect(stateOf(business.state_id as string).form_step_id).toBe(steps[1]!.id);
  expect(JSON.parse(steps[1]!.controls_json)).toContain('textbox|Company name');
  const replays = rows(
    gs,
    "SELECT id FROM trace_spans WHERE run_id = ? AND kind = 'phase' AND name = 'replay'",
    run,
  );
  expect(replays.length).toBeGreaterThanOrEqual(1);
});
