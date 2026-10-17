import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  actionNamed,
  gate,
  gateServer,
  markForProbing,
  resetScars,
  rows,
  scarNav,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/**
 * Form probes on SC-19 (owner 2026-10-16, spec 032 US2): after the happy path the crawler tries the
 * probe catalogue on each step, and every outcome is a recorded state with its probe and kind:
 * the browser's own messages and the script's (validation), the Business option leading to a code
 * confirmation (branch, blocked there), a broken quote request (technical). The budget holds, and a
 * read-only persona probes nothing. Probing only when asked (US5, owner 2026-10-17): a plain scan
 * maps the wizard and cannot probe; a probe run probes only the steps marked for probing.
 */
const PORTAL = 'scar-maker';
let gs: GateServer;
let route: string;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
  // Map first: a plain scan records the wizard's steps; nobody has marked them yet.
  const run = await startRun(gs.call, PORTAL, 'quote-tester');
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
  route = step1.route_template as string;
});
afterAll(async () => {
  await gs?.close();
});

/** What `probe_form` answers (the part these cases read). */
interface Probed {
  outcomes: { outcome_kind: string }[];
  skipped: string[];
  missing_test_data?: string[];
  blocked?: string;
  budget?: { per_step: number; per_run: number };
  more?: number;
}

/** Probe one step to its end: a call that hit its time limit says `more`, the next one goes on. */
const probe = async (run: string, page: Body): Promise<Probed> => {
  const all: Probed = { outcomes: [], skipped: [] };
  for (let call = 0; call < 6; call++) {
    const r = await gs.call('probe_form', {
      run_id: run,
      action_id: actionNamed(page, 'Next')!.action_id,
      rationale: 'gate: probe this step',
    });
    if (r.isError) throw new Error(`probe_form: ${JSON.stringify(r.body).slice(0, 400)}`);
    const body = r.body as Probed;
    Object.assign(all, body, {
      outcomes: [...all.outcomes, ...body.outcomes],
      skipped: [...all.skipped, ...body.skipped],
    });
    if (!body.more) return all;
  }
  throw new Error('probe_form never finished the step');
};

interface Outcome {
  probe_id: string;
  probe_group: string;
  outcome_kind: string;
  messages_json: string;
  to_state_id: string | null;
  evidence_ref: string;
  possible_new_process: number;
  inputs_json: string;
  path_json: string;
}
const outcomes = (run: string) =>
  rows<Outcome>(gs, 'SELECT * FROM probe_outcomes WHERE run_id = ? ORDER BY created_at', run);

/** A probe run of the persona, after marking every step of the wizard. */
const probeRun = (persona: string) => {
  markForProbing(gs, PORTAL, route);
  return startRun(gs.call, PORTAL, persona, { probe_marked: true });
};

const openMarks = () =>
  rows<{ target_id: string }>(
    gs,
    `SELECT target_id FROM marks WHERE portal_id = ? AND used_by_run_id IS NULL`,
    PORTAL,
  ).map((m) => m.target_id);

gate('SC-19', 'a plain scan never probes; a probe run probes only marked steps', async () => {
  const plain = await startRun(gs.call, PORTAL, 'quote-tester');
  const page = await scarNav(gs.call, plain, '/sc19/apply');
  const refused = await gs.call('probe_form', {
    run_id: plain,
    action_id: actionNamed(page, 'Next')!.action_id,
    rationale: 'gate: probing a plain scan',
  });
  expect(refused.body).toMatchObject({ error: { code: 'PROBE_NOT_ASKED' } });

  gs.ctx.raw.prepare(`DELETE FROM marks WHERE used_by_run_id IS NULL`).run();
  const none = await gs.call('start_run', {
    portal_id: PORTAL,
    persona_id: 'quote-tester',
    probe_marked: true,
  });
  expect(none.body).toMatchObject({ error: { code: 'NO_PROBE_MARKS' } });

  const [first, second] = markForProbing(gs, PORTAL, route);
  gs.ctx.raw.prepare(`DELETE FROM marks WHERE target_id = ?`).run(second);
  const started = await gs.call('start_run', {
    portal_id: PORTAL,
    persona_id: 'quote-tester',
    probe_marked: true,
  });
  const run = started.body.run_id as string;
  expect(started.body.probe_marks).toEqual([
    expect.objectContaining({ form_step_id: first, step_index: 1, route }),
  ]);
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  const step2 = await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
  const unmarked = await gs.call('probe_form', {
    run_id: run,
    action_id: actionNamed(step2, 'Next')!.action_id,
    rationale: 'gate: an unmarked step',
  });
  expect(unmarked.body).toMatchObject({ error: { code: 'STEP_NOT_MARKED' } });
  const done = await probe(run, step1);
  expect(done.outcomes.length).toBeGreaterThan(0);
  // Probed to the end: the mark is used, and the run finishes with its frontier left.
  expect(openMarks()).not.toContain(first);
  const finished = await gs.call('finish_run', { run_id: run, rationale: 'gate: marks probed' });
  expect(finished.body).toMatchObject({ status: 'completed' });
});

gate('SC-19', 'probes record validation, branch and technical outcomes with evidence', async () => {
  const run = await probeRun('quote-tester');
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  const first = await probe(run, step1);
  // Step 1 sends no request: its technical tries are listed as skipped, not as states.
  expect(first.outcomes.length).toBeLessThanOrEqual(12);
  expect(first.outcomes.every((o) => o.outcome_kind === 'validation')).toBe(true);
  expect(first.skipped.join(' ')).toMatch(/no request/);
  const native = outcomes(run).find((o) => o.probe_id === 'required-empty-all')!;
  expect(JSON.parse(native.messages_json)).toEqual(
    expect.arrayContaining([expect.objectContaining({ source: 'native' })]),
  );

  const step2 = await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
  const second = await probe(run, step2);
  const kinds = new Set(second.outcomes.map((o) => o.outcome_kind));
  expect([...kinds].sort()).toEqual(expect.arrayContaining(['branch', 'technical', 'validation']));
  const business = outcomes(run).find((o) => o.probe_id === 'option')!;
  expect(business).toMatchObject({ outcome_kind: 'branch', possible_new_process: 1 });
  const http500 = outcomes(run).find((o) => o.probe_id === 'http-500')!;
  const errorPage = rows<{ state_kind: string }>(
    gs,
    'SELECT state_kind FROM states WHERE id = ?',
    http500.to_state_id,
  )[0]!;
  expect(errorPage.state_kind).toBe('technical');
  for (const o of outcomes(run)) expect(o.evidence_ref.length).toBeGreaterThan(0);
  // The suite's base: the way to step 2 by labels, then this try's own values and press.
  const path = JSON.parse(business.path_json) as { start_url: string; steps: { name: string }[] };
  expect(path.start_url).toContain('/sc19/apply');
  expect(path.steps.map((s) => s.name)).toEqual(expect.arrayContaining(['Full name', 'Next']));
  expect(JSON.parse(business.inputs_json)).toEqual(
    expect.arrayContaining([{ name: 'Business', kind: 'check' }]),
  );
});

gate(
  'SC-19',
  'the happy values must pass first: missing test data is named, not guessed',
  async () => {
    const run = await probeRun('applicant');
    const step1 = await scarNav(gs.call, run, '/sc19/apply');
    const step2 = await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
    const r = await probe(run, step2);
    expect(r.outcomes).toEqual([]);
    // Autofill types "Test" as the promo code; the quote API refuses it and names the field.
    expect(r.missing_test_data).toEqual(['Promo code (optional)']);
  },
);

gate(
  'F-17@032',
  'a slow request on a page-load form ends: the held page load is let through',
  async () => {
    // SC-04 is a plain `<form method="get">`: its submit is a page load, not a script call.
    const map = await startRun(gs.call, PORTAL, 'quote-tester');
    const mapped = await scarNav(gs.call, map, '/sc04/');
    markForProbing(gs, PORTAL, mapped.route_template as string);
    const run = await startRun(gs.call, PORTAL, 'quote-tester', { probe_marked: true });
    const page = await scarNav(gs.call, run, '/sc04/');
    const t = Date.now();
    const r = await gs.call('probe_form', {
      run_id: run,
      action_id: actionNamed(page, 'Show')!.action_id,
      probes: ['delay'],
      rationale: 'gate: a slow page load',
    });
    if (r.isError) throw new Error(`probe_form: ${JSON.stringify(r.body).slice(0, 400)}`);
    expect(Date.now() - t).toBeLessThan(45_000);
    const delay = outcomes(run).find((o) => o.probe_id === 'delay')!;
    expect(delay.outcome_kind).toBe('technical');
    const [landed] = rows<{ route_template: string }>(
      gs,
      'SELECT route_template FROM states WHERE id = ?',
      delay.to_state_id,
    );
    expect(landed!.route_template).toMatch(/result/);
  },
  { timeout: 90_000 },
);

gate('SC-19', 'a read-only persona probes nothing, and the budget is the portal file', async () => {
  const run = await probeRun('guest');
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  const r = await probe(run, step1);
  expect(r.blocked).toMatch(/action limit/);
  expect(outcomes(run).map((o) => o.outcome_kind)).toEqual(['blocked']);
  expect(r.budget).toMatchObject({ per_step: 12, per_run: 60 });
});
