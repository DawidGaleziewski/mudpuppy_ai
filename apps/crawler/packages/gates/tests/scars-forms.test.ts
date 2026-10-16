import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  gate,
  gateServer,
  lastVisit,
  resetScars,
  rows,
  scarNav,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/** A form driven to its end (SC-18, owner addition 2026-10-15) on apps/scar-maker (spec 030). */
const PORTAL = 'scar-maker';

let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await gs?.close();
});

const landed = (result: Body) => lastVisit(gs, result.state_id as string).url;

/** The ARIA snapshot after every step of the trace, joined: what the BA reads about the process. */
const stepSnapshots = (run: string) =>
  rows<{ evidence_ref: string }>(
    gs,
    `SELECT s.evidence_ref FROM process_steps s JOIN processes p ON p.id = s.process_id
      WHERE p.run_id = ? ORDER BY s.ord`,
    run,
  )
    .map((r) => readFileSync(gs.ctx.evidence.resolve(r.evidence_ref), 'utf8'))
    .join('\n');

/** Fill one field of the current page by its label; returns the page after the fill. */
const fill = (run: string, page: Body, label: string, value: string) =>
  actOn(gs.call, run, page, label, { value, intent: `enter ${label}` });

// Already held on master before spec 030: the trace fills, waits for the button to become enabled
// and records each step's snapshot (process_steps.evidence_ref), so every message is kept.
gate(
  'SC-18',
  'a three-step form: every validation message recorded, Back, success page reached',
  async () => {
    const run = await startRun(gs.call, PORTAL, 'applicant', {
      mode: 'trace',
      process: { name: 'Apply for a contract', goal: 'complete the three-step application' },
    });
    let p = await scarNav(gs.call, run, '/sc18/step-1', { intent: 'open step 1' });
    // Invalid first: each validator's message must be recorded.
    p = await fill(run, p, 'Full name', 'A');
    p = await fill(run, p, 'E-mail', 'not-an-address');
    p = await fill(run, p, 'Year of birth', '2015');
    // Then valid, so Next becomes enabled.
    p = await fill(run, p, 'Full name', 'Test Person');
    p = await fill(run, p, 'E-mail', 'applicant@example.test');
    p = await fill(run, p, 'Year of birth', '1990');
    p = await actOn(gs.call, run, p, 'Next', { intent: 'go to step 2' });
    expect(landed(p)).toContain('/sc18/step-2');

    p = await actOn(gs.call, run, p, 'Product', {
      value: 'Household insurance',
      intent: 'product',
    });
    p = await fill(run, p, 'Start year', '2000');
    p = await fill(run, p, 'Customer number', 'X');
    p = await fill(run, p, 'Start year', '2027');
    p = await fill(run, p, 'Customer number', 'KD-123456');
    p = await actOn(gs.call, run, p, 'I accept the terms', { intent: 'accept the terms' });
    p = await actOn(gs.call, run, p, 'Next', { intent: 'go to step 3' });
    expect(landed(p)).toContain('/sc18/step-3');

    p = await actOn(gs.call, run, p, 'Back', { intent: 'check step 2 again' });
    expect(landed(p)).toContain('/sc18/step-2');
    p = await actOn(gs.call, run, p, 'Next', { intent: 'back to the summary' });
    p = await actOn(gs.call, run, p, 'I confirm the data is correct', { intent: 'confirm' });
    p = await actOn(gs.call, run, p, 'Submit application', { intent: 'submit' });
    expect(landed(p)).toContain('/sc18/success');

    const seen = stepSnapshots(run);
    for (const message of [
      'Full name must have at least 2 characters.',
      'Enter a valid e-mail address.',
      'You must be at least 18 years old.',
      'The contract cannot start before you are 18.',
      'The customer number looks like KD-123456.',
    ])
      expect(seen, message).toContain(message);
  },
);
