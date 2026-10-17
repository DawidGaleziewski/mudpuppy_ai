import { join } from 'node:path';
import { loadTraces, TraceSpecEntry } from '@pathfinder/config';
import { driveTrace, proposeProbeSuite, startSession } from '@pathfinder/mcp-server';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  actionNamed,
  gate,
  gateServer,
  markForProbing,
  REPO,
  resetScars,
  rows,
  SCAR_BASE,
  scarNav,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * The owner-reviewed probe suite (SC-19, spec 032 US3, owner decision D-2): the BA picks probe
 * outcomes of a probing run, the server builds a `traces.yaml` trace from them and keeps it open
 * (not in the catalogue: it cannot run before the owner approves it, which the chat service does,
 * apps/chat tests/probe-suites.test.ts). Driven twice, each variant ends on the same kind of page.
 */
const PORTAL = 'scar-maker';
const PERSONA = 'quote-tester';
let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await gs?.close();
});

interface Outcome {
  id: string;
  probe_id: string;
  outcome_kind: string;
}

/** Where a run ended: the route, the form step and the kind of its last page. */
const landing = (runId: string | null) =>
  rows<{ route_template: string; form_step_id: string | null; state_kind: string; step: string }>(
    gs,
    `SELECT s.route_template, s.form_step_id, s.state_kind, f.step_index || ' ' || f.label AS step
       FROM page_visits v JOIN states s ON s.id = v.state_id LEFT JOIN form_steps f ON f.id = s.form_step_id
       WHERE v.run_id = ? ORDER BY v.created_at DESC, v.rowid DESC LIMIT 1`,
    runId,
  )[0];

gate('SC-19', 'an owner-reviewed suite runs the same way every time', async () => {
  // Map first, mark the wizard's steps, then probe them (spec 032 US5).
  const mapped = await startRun(gs.call, PORTAL, PERSONA);
  const seen = await scarNav(gs.call, mapped, '/sc19/apply');
  await actOn(gs.call, mapped, seen, 'Next', { intent: 'go to step 2' });
  markForProbing(gs, PORTAL, seen.route_template as string);
  const run = await startRun(gs.call, PORTAL, PERSONA, { probe_marked: true });
  const step1 = await scarNav(gs.call, run, '/sc19/apply');
  const step2 = await actOn(gs.call, run, step1, 'Next', { intent: 'go to step 2' });
  for (let call = 0; call < 6; call++) {
    const r = await gs.call('probe_form', {
      run_id: run,
      action_id: actionNamed(step2, 'Next')!.action_id,
      rationale: 'gate: probe step 2',
      probes: ['option', 'http-500', 'wrong-format'],
    });
    if (r.isError || !r.body.more) break;
  }
  const outcomes = rows<Outcome>(
    gs,
    'SELECT id, probe_id, outcome_kind FROM probe_outcomes WHERE run_id = ?',
    run,
  );
  const pick = (probe: string) => outcomes.find((o) => o.probe_id === probe)!.id;

  const session = startSession(gs.ctx, { portal_id: PORTAL, run_ids: [run] }).session_id;
  const proposed = proposeProbeSuite(gs.ctx, {
    session_id: session,
    run_id: run,
    trace: { id: 'quote', name: 'Get a quote', goal: 'Get a yearly price for a car insurance' },
    variants: [
      { id: 'happy-path', probe_outcome_id: pick('happy-path'), why: 'the quote with valid data' },
      {
        id: 'business',
        probe_outcome_id: pick('option'),
        why: 'business customers confirm by code',
      },
      {
        id: 'quote-500',
        probe_outcome_id: pick('http-500'),
        why: 'what the user sees when quoting fails',
      },
      {
        id: 'bad-date',
        probe_outcome_id: pick('wrong-format'),
        why: 'the start date format is checked',
      },
    ],
  });
  expect(proposed).toMatchObject({ status: 'open', variants: 4 });
  // Not approved: nothing reached the catalogue the trace driver reads.
  const catalogue = loadTraces(join(REPO, 'portals', PORTAL, 'traces.yaml'));
  expect(catalogue.some((t) => t.id === 'quote')).toBe(false);

  const row = rows<{ trace_json: string }>(
    gs,
    'SELECT trace_json FROM probe_suites WHERE id = ?',
    proposed.suite_id,
  )[0]!;
  const trace = TraceSpecEntry.parse(JSON.parse(row.trace_json));
  expect(trace.variants.map((v) => [v.id, v.expect, v.fault])).toEqual([
    ['happy-path', 'proceed', undefined],
    ['business', 'branch', undefined],
    ['quote-500', 'technical_error', 'http_500'],
    ['bad-date', 'validation_error', undefined],
  ]);
  const drive = () =>
    driveTrace(gs.call, { portal: PORTAL, persona: PERSONA, baseUrl: `${SCAR_BASE}/` }, trace);
  const first = await drive();
  const second = await drive();
  const ends = (results: typeof first) =>
    results.map((r) => [r.variant, r.outcome, r.reason ?? null, landing(r.runId)]);
  expect(ends(second)).toEqual(ends(first));
  const byVariant = Object.fromEntries(first.map((r) => [r.variant, landing(r.runId)]));
  expect(byVariant['quote-500']!.state_kind).toBe('technical');
  expect(byVariant['bad-date']!.state_kind).toBe('validation');
  expect(byVariant['business']!.form_step_id).not.toBe(byVariant['happy-path']!.form_step_id);
});
