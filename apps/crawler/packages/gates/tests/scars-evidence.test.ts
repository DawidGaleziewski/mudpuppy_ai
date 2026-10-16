import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  resetScars,
  rows,
  scarNav,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Evidence only when the page is ready (spec 030 R-60): failed assets are flagged on the state
 * (SC-12), intermittent error pages are retried and never become screens (SC-17, owner addition).
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

const notes = (run: string, rule: string) =>
  rows<{ subject_ref: string; detail_json: string }>(
    gs,
    'SELECT subject_ref, detail_json FROM decision_log WHERE run_id = ? AND rule = ?',
    run,
    rule,
  );

gate(
  'SC-12',
  'a state whose stylesheet and script failed carries a render warning naming them',
  async () => {
    const run = await startRun(gs.call, PORTAL, 'guest');
    const p = await scarNav(gs.call, run, '/sc12/');
    const [w] = notes(run, 'render:assets_failed');
    expect(w?.subject_ref).toBe(p.state_id);
    expect(w?.detail_json).toContain('theme.css');
    expect(w?.detail_json).toContain('widget.js');
    const clean = await scarNav(gs.call, run, '/sc12/details');
    expect(notes(run, 'render:assets_failed').map((n) => n.subject_ref)).not.toContain(
      clean.state_id,
    );
  },
);

const ERROR_TEXT = /Service temporarily unavailable|Internal error|technical error has occurred/;

gate(
  'SC-17',
  'intermittent error pages: the real screens are recorded, error visits are never screens',
  async () => {
    const run = await startRun(gs.call, PORTAL, 'guest');
    const hub = await scarNav(gs.call, run, '/sc17/');
    for (let i = 1; i <= 6; i++) {
      const item = await scarNav(gs.call, run, `/sc17/item-${i}`);
      expect(snapshot(gs, item.state_id as string), `item ${i}`).toMatch(
        /overview with \d+ entries/,
      );
    }
    // A revisit of the hub meets a soft error once; the hub state stays the good one.
    const again = await scarNav(gs.call, run, '/sc17/');
    expect(again.state_id).toBe(hub.state_id);
    const states = rows<{ state_id: string }>(
      gs,
      'SELECT DISTINCT state_id FROM page_visits WHERE run_id = ?',
      run,
    );
    for (const s of states) expect(snapshot(gs, s.state_id)).not.toMatch(ERROR_TEXT);
    expect(notes(run, 'transient_error').length).toBeGreaterThanOrEqual(7);
  },
);
