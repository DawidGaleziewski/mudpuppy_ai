import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  actionNamed,
  gate,
  gateServer,
  lastVisit,
  resetScars,
  rows,
  SCAR_BASE,
  scarNav,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/**
 * Scars of clicks and classification (spec 030 R-57) on apps/scar-maker: what a read-only run on a
 * legacy or SPA page must and must not click.
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

const actionRow = (run: string, name: string) =>
  rows<{ safety_class: string; allowed: number; skip_reason: string | null }>(
    gs,
    'SELECT safety_class, allowed, skip_reason FROM actions WHERE run_id = ? AND accessible_name = ?',
    run,
    name,
  )[0];

/** The verbatim URL an act or navigate result landed on. */
const landed = (result: Body) => lastVisit(gs, result.state_id as string).url;

const runStatus = (run: string) =>
  rows<{ status: string }>(gs, 'SELECT status FROM runs WHERE id = ?', run)[0]!.status;

gate('SC-01', 'links inside one page-wide POST form are read and clicked', async () => {
  const run = await startRun(gs.call, PORTAL, 'guest');
  const page = await scarNav(gs.call, run, '/sc01/');
  expect(actionRow(run, 'Verträge')).toMatchObject({ safety_class: 'read', allowed: 1 });
  const after = await actOn(gs.call, run, page, 'Verträge');
  expect(landed(after)).toBe(`${SCAR_BASE}/sc01/vertraege`);
  // The real submit button of the form stays a mutating control.
  expect(actionRow(run, 'Aktualisieren')?.safety_class).not.toBe('read');
});

gate('SC-02', 'a 403 background call does not stop the run; a 403 page does', async () => {
  const run = await startRun(gs.call, PORTAL, 'guest');
  await scarNav(gs.call, run, '/sc02/');
  const details = await scarNav(gs.call, run, '/sc02/details');
  expect(landed(details)).toBe(`${SCAR_BASE}/sc02/details`);
  expect(runStatus(run)).toBe('running');

  const blocked = await startRun(gs.call, PORTAL, 'guest');
  await gs.call('navigate', {
    run_id: blocked,
    url: `${SCAR_BASE}/sc02/forbidden`,
    rationale: 'gate step',
  });
  expect(runStatus(blocked)).not.toBe('running');
});

// Already handled on master before spec 030 (the action gate treats a `javascript:` href as a
// click, spec 015); kept as a gate so it stays so.
gate(
  'SC-03',
  'a javascript postback link is clicked; mailto and tel links do not break the page',
  async () => {
    const run = await startRun(gs.call, PORTAL, 'guest');
    const page = await scarNav(gs.call, run, '/sc03/');
    expect(actionNamed(page, 'Write to the service')).toBeDefined();
    const after = await actOn(gs.call, run, page, 'Next step');
    expect(landed(after)).toContain('/sc03/step-2');
  },
);

// Already handled: Playwright's `selectOption(string)` matches the value or the label.
gate('SC-04', 'a trace selects an option by its visible label', async () => {
  const run = await startRun(gs.call, PORTAL, 'guest', {
    mode: 'trace',
    process: { name: 'Show a contract', goal: 'pick a contract by its label' },
  });
  const page = await scarNav(gs.call, run, '/sc04/', { intent: 'open the contract picker' });
  const picked = await actOn(gs.call, run, page, 'Contract', {
    value: 'Household insurance',
    intent: 'choose the household contract',
  });
  const shown = await actOn(gs.call, run, picked, 'Show', { intent: 'show the contract' });
  expect(landed(shown)).toContain('contract=K-7731');
});

gate('SC-05', 'German send, submit, delete and save controls are never read', async () => {
  const run = await startRun(gs.call, PORTAL, 'guest');
  await scarNav(gs.call, run, '/sc05/');
  for (const name of ['Senden', 'Antrag absenden', 'Löschen', 'Speichern'])
    expect(actionRow(run, name), name).toMatchObject({ allowed: 0 });
  expect(actionRow(run, 'Übersicht')).toMatchObject({ safety_class: 'read', allowed: 1 });
});
