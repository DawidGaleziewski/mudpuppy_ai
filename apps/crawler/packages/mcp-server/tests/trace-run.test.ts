import { afterEach, describe, expect, it } from 'vitest';
import { newId, nowIso } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startReferencePortal, type ReferencePortal } from '@pathfinder/reference-portal';
import { startHarness, type Body, type Call } from './harness.js';
import { makeCtx } from './helpers.js';

const available = await canLaunchBrowser();

/** The reference portal on a random port, onboarded with configuration only. */
const portalYaml = (id: string, origin: string, environment: 'sandbox' | 'production') => `
id: ${id}
base_url: ${origin}/
environment: ${environment}
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
const PERSONA = `id: guest
auth: none
max_action_class: read
viewport: { width: 1280, height: 800 }
locale: pl-PL
trace_inputs:
  Model: Octavia
`;

const VEHICLE: [string, string, string][] = [
  ['combobox', 'Marka', 'skoda'],
  ['textbox', 'Model', 'Octavia'],
  ['spinbutton', 'Rok produkcji', '2018'],
  ['spinbutton', 'Pojemność silnika (cm³)', '1600'],
  ['textbox', 'Kod pocztowy', '00-950'],
];
const DRIVER: [string, string, string][] = [
  ['textbox', 'Data urodzenia', '1986-01-01'],
  ['spinbutton', 'Rok uzyskania prawa jazdy', '2005'],
  ['spinbutton', 'Lata bezszkodowej jazdy', '6'],
];
const CONSENTS = ['Zgoda na przetwarzanie danych osobowych', 'Oświadczam, że zapoznałem się z OWU'];
const RESULT_QUERY =
  'marka=skoda&model=Octavia&rok_produkcji=2018&pojemnosc=1600&kod_pocztowy=00-950' +
  '&data_urodzenia=1986-01-01&rok_prawa_jazdy=2005&lata_bezszkodowe=6&zgoda_dane=tak&zgoda_owu=tak' +
  '&zakres=oc&kod_rabatowy=';

const portals: ReferencePortal[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const p of portals.splice(0)) await p.close();
});

async function setup(environment: 'sandbox' | 'production') {
  const portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  portals.push(portal);
  const origin = portal.url.replace(/\/$/, '');
  const id = environment === 'sandbox' ? 'reference-insurer' : 'reference-insurer-readonly';
  const ctx = await makeCtx();
  const h = await startHarness(
    {
      [`portals/${id}/portal.yaml`]: portalYaml(id, origin, environment),
      [`personas/${id}/guest.yaml`]: PERSONA,
    },
    ctx,
  );
  h.ctx.dbEnvironment = environment;
  cleanups.push(h.cleanup);
  return { ...h, portal, origin, id };
}

/** `call` that fails the test on a refusal. */
const must =
  (call: Call) =>
  async (name: string, args: Record<string, unknown>): Promise<Body> => {
    const r = await call(name, args);
    if (r.isError) throw new Error(`${name} refused: ${JSON.stringify(r.body)}`);
    return r.body;
  };

function find(page: Body, role: string, name: string): Body {
  const a = (page.actions as Body[]).find((x) => x.role === role && x.accessible_name === name);
  if (!a) {
    const seen = (page.actions as Body[]).map((x) => `${x.role} "${x.accessible_name}"`);
    throw new Error(`no ${role} "${name}" on ${page.route_template}; actions: ${seen.join(', ')}`);
  }
  return a;
}

/** Seed an `open` follow-up record of the portal; returns its key. */
async function seedFollowup(
  ctx: Awaited<ReturnType<typeof makeCtx>>,
  portalId: string,
  seq: number,
) {
  const id = newId();
  const key = `FUP-${String(seq).padStart(3, '0')}`;
  ctx.opened.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, created_at, updated_at)
       VALUES (?, ?, 'followup', ?, ?, 'Trace the calculator', 1, ?, ?)`,
    )
    .run(id, portalId, key, seq, nowIso(), nowIso());
  ctx.opened.raw
    .prepare(`INSERT INTO followup_tasks (record_id, status, updated_at) VALUES (?, 'open', ?)`)
    .run(id, nowIso());
  return { id, key };
}

const followup = (ctx: Awaited<ReturnType<typeof makeCtx>>, recordId: string) =>
  ctx.opened.raw
    .prepare('SELECT status, run_id, blocked_reason FROM followup_tasks WHERE record_id = ?')
    .get(recordId) as { status: string; run_id: string | null; blocked_reason: string | null };

const PROCESS = { name: 'Oblicz składkę OC/AC', goal: 'See the yearly premium for a car' };

describe.skipIf(!available)('trace mode on the reference portal (spec 004 R-14, US4)', () => {
  it('sandbox: records the calculator as steps up to the result page (goal_reached)', async () => {
    const { ctx, call, origin, id } = await setup('sandbox');
    const ok = must(call);
    const fup = await seedFollowup(ctx, id, 1);

    const start = await ok('start_run', {
      portal_id: id,
      persona_id: 'guest',
      mode: 'trace',
      process: PROCESS,
      followup_key: fup.key,
    });
    const runId = start.run_id as string;
    expect(followup(ctx, fup.id)).toMatchObject({ status: 'in_progress', run_id: runId });

    // No frontier in trace mode.
    expect((await ok('get_next_frontier_item', { run_id: runId })).item).toBeNull();

    let page = await ok('navigate', {
      run_id: runId,
      url: `${origin}/kalkulator/pojazd`,
      intent: 'Open the car insurance calculator',
      rationale: 'trace start',
    });
    expect(page.step).toMatchObject({ ord: 1 });
    // The persona's trace_inputs value is offered with the matching field.
    expect(find(page, 'textbox', 'Model')).toMatchObject({
      safety_class: 'read',
      suggested_value: 'Octavia',
    });
    expect(find(page, 'textbox', 'Model')).not.toHaveProperty('value');
    // A trace has no frontier, so start_run names where to begin.
    expect(start.base_url).toBe(`${origin}/`);

    const fill = async (role: string, name: string, value: string) => {
      page = await ok('act', {
        run_id: runId,
        action_id: find(page, role, name).action_id,
        value,
        intent: `Enter ${name}`,
        rationale: 'trace step',
      });
    };
    const click = async (role: string, name: string, intent: string) => {
      page = await ok('act', {
        run_id: runId,
        action_id: find(page, role, name).action_id,
        intent,
        rationale: 'trace step',
      });
    };

    for (const [role, name, value] of VEHICLE) await fill(role, name, value);
    await click('button', 'Dalej', 'Go to the driver step');
    expect(page.route_template).toBe('/kalkulator/kierowca');
    expect(page.step.outcomes.join(' ')).toMatch(/route/i);

    for (const [role, name, value] of DRIVER) await fill(role, name, value);
    for (const c of CONSENTS) await click('checkbox', c, `Accept: ${c}`);
    await click('button', 'Dalej', 'Go to the options step');
    expect(page.route_template).toBe('/kalkulator/opcje');
    await click('button', 'Oblicz składkę', 'Calculate the premium');
    expect(page.route_template).toBe('/kalkulator/wynik');

    const fin = await ok('finish_run', {
      run_id: runId,
      outcome: 'goal_reached',
      observed_result: 'The result page shows a table "Wyliczenie składki rocznej".',
      rationale: 'goal reached',
    });
    expect(fin).toBeDefined();

    const proc = await ctx.db
      .selectFrom('processes')
      .selectAll()
      .where('run_id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(proc).toMatchObject({
      status: 'recorded',
      outcome: 'goal_reached',
      name: PROCESS.name,
      followup_record_id: fup.id,
    });
    const steps = await ctx.db
      .selectFrom('process_steps')
      .selectAll()
      .where('process_id', '=', proc.id)
      .orderBy('ord')
      .execute();
    expect(steps.map((s) => s.ord)).toEqual(steps.map((_, i) => i + 1));
    expect(steps[0]).toMatchObject({ kind: 'navigate', action_id: null });
    const kinds = new Set(steps.map((s) => s.kind));
    for (const k of ['navigate', 'fill', 'select', 'check', 'click']) expect(kinds).toContain(k);
    expect(steps.find((s) => s.kind === 'fill')?.value).toBe('Octavia');
    for (const s of steps) {
      expect(s.confidence).toBe('observed');
      expect(s.evidence_ref).not.toBe('');
      expect(Array.isArray(JSON.parse(s.outcomes_json))).toBe(true);
    }
    const last = steps.at(-1)!;
    const lastState = await ctx.db
      .selectFrom('states')
      .select('route_template')
      .where('id', '=', last.state_after!)
      .executeTakeFirstOrThrow();
    expect(lastState.route_template).toBe('/kalkulator/wynik');

    const run = await ctx.db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(run).toMatchObject({ mode: 'trace', status: 'completed' });
    expect(followup(ctx, fup.id).status).toBe('done');
  }, 120_000);

  it('production: stops at "Kup polisę" with TRACE_BOUNDARY_REACHED and sends no POST (SC-005)', async () => {
    const { ctx, call, origin, id, portal } = await setup('production');
    const ok = must(call);
    const fup = await seedFollowup(ctx, id, 2);
    const runId = (
      await ok('start_run', {
        portal_id: id,
        persona_id: 'guest',
        mode: 'trace',
        process: { name: 'Kup polisę OC', goal: 'Buy the calculated policy' },
        followup_key: fup.key,
      })
    ).run_id as string;
    const page = await ok('navigate', {
      run_id: runId,
      url: `${origin}/kalkulator/wynik?${RESULT_QUERY}`,
      intent: 'Open a calculated premium',
      rationale: 'trace start',
    });
    const buy = find(page, 'button', 'Kup polisę');
    const r = await call('act', {
      run_id: runId,
      action_id: buy.action_id,
      intent: 'Buy the policy',
      rationale: 'trace step',
    });
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatchObject({
      code: 'TRACE_BOUNDARY_REACHED',
      steps: 1,
      action: { role: 'button', name: 'Kup polisę' },
    });
    expect(r.body.error.process_id).toEqual(expect.any(String));
    expect(r.body.error.rule).toEqual(expect.any(String));

    const proc = await ctx.db
      .selectFrom('processes')
      .selectAll()
      .where('run_id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(proc).toMatchObject({ outcome: 'boundary_reached', boundary_action_id: buy.action_id });
    expect(proc.not_observable).toMatch(/Kup polisę/);
    const questions = await ctx.db
      .selectFrom('open_questions')
      .select('text')
      .where('run_id', '=', runId)
      .execute();
    expect(questions).toHaveLength(1);
    expect(questions[0]!.text).toMatch(/What happens after 'Kup polisę'\? Not observable/);
    const run = await ctx.db
      .selectFrom('runs')
      .select('status')
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('completed');
    expect(followup(ctx, fup.id)).toMatchObject({ status: 'blocked' });
    expect(followup(ctx, fup.id).blocked_reason).toEqual(expect.any(String));
    expect(portal.requests.filter((q) => q.method !== 'GET' && q.method !== 'HEAD')).toEqual([]);
  }, 120_000);

  it('refuses malformed trace inputs and keeps map mode unchanged', async () => {
    const { ctx, call, origin, id } = await setup('sandbox');
    const ok = must(call);
    const refused = async (name: string, args: Record<string, unknown>) => {
      const r = await call(name, args);
      expect(r.isError).toBe(true);
      return r.body.error as Body;
    };

    // `process` is required in trace mode and forbidden in map mode.
    expect(
      await refused('start_run', { portal_id: id, persona_id: 'guest', mode: 'trace' }),
    ).toMatchObject({
      code: 'SCHEMA_INVALID',
    });
    expect(
      await refused('start_run', { portal_id: id, persona_id: 'guest', process: PROCESS }),
    ).toMatchObject({ code: 'SCHEMA_INVALID' });
    // A follow-up key must name an open FUP of the portal.
    expect(
      await refused('start_run', {
        portal_id: id,
        persona_id: 'guest',
        mode: 'trace',
        process: PROCESS,
        followup_key: 'FUP-999',
      }),
    ).toMatchObject({ code: 'UNKNOWN_REF' });

    const runId = (
      await ok('start_run', { portal_id: id, persona_id: 'guest', mode: 'trace', process: PROCESS })
    ).run_id as string;
    // `intent` is required on every trace call.
    expect(
      await refused('navigate', {
        run_id: runId,
        url: `${origin}/kalkulator/pojazd`,
        rationale: 'x',
      }),
    ).toMatchObject({ code: 'SCHEMA_INVALID' });
    const page = await ok('navigate', {
      run_id: runId,
      url: `${origin}/kalkulator/pojazd`,
      intent: 'Open the calculator',
      rationale: 'x',
    });
    // An agent-supplied value the PII scrubber would change is refused.
    expect(
      await refused('act', {
        run_id: runId,
        action_id: find(page, 'textbox', 'Model').action_id,
        value: 'jan.kowalski@example.com',
        intent: 'Enter the model',
        rationale: 'x',
      }),
    ).toMatchObject({ code: 'PII_SUSPECTED' });
    // After a step changed the page, an action id from the earlier page is refused instead of
    // re-opening that page (which would drop what was typed).
    const filled = await ok('act', {
      run_id: runId,
      action_id: find(page, 'textbox', 'Model').action_id,
      value: 'Octavia',
      intent: 'Enter the model',
      rationale: 'x',
    });
    expect(filled.state_id).not.toBe(page.state_id);
    expect(
      await refused('act', {
        run_id: runId,
        action_id: find(page, 'spinbutton', 'Rok produkcji').action_id,
        value: '2018',
        intent: 'Enter the year',
        rationale: 'x',
      }),
    ).toMatchObject({ code: 'UNKNOWN_ACTION' });
    // A click that changes nothing visible says so, with the browser's message for each field
    // that held the submit back (here the required "marka" select is still empty).
    const held = await ok('act', {
      run_id: runId,
      action_id: find(filled, 'button', 'Dalej').action_id,
      intent: 'Try to continue with missing fields',
      rationale: 'x',
    });
    expect(held.step.outcomes[0]).toBe('No visible change after the step');
    expect(held.step.outcomes).toContainEqual(
      expect.stringMatching(/^Browser validation on marka: \S/),
    );
    expect(held.step.outcomes.join('\n')).not.toMatch(/Browser validation on model:/);
    // A trace run cannot finish without an outcome.
    expect(await refused('finish_run', { run_id: runId, rationale: 'x' })).toMatchObject({
      code: 'SCHEMA_INVALID',
    });
    await ok('finish_run', {
      run_id: runId,
      outcome: 'abandoned',
      observed_result: 'Stopped on step 1.',
      rationale: 'x',
    });
    const proc = await ctx.db
      .selectFrom('processes')
      .select('outcome')
      .where('run_id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(proc.outcome).toBe('abandoned');

    // Map mode: no step in results, form fields are not actions, no process row.
    const mapRun = (await ok('start_run', { portal_id: id, persona_id: 'guest' })).run_id as string;
    const mapPage = await ok('navigate', {
      run_id: mapRun,
      url: `${origin}/kalkulator/pojazd`,
      rationale: 'x',
    });
    expect(mapPage.step).toBeUndefined();
    expect((mapPage.actions as Body[]).some((a) => a.role === 'textbox')).toBe(false);
    const mapProcs = await ctx.db
      .selectFrom('processes')
      .select('id')
      .where('run_id', '=', mapRun)
      .execute();
    expect(mapProcs).toEqual([]);
    // The trace run above created the vehicle-step state; this run still records its form, so
    // the BA finds it in the runs it reads.
    expect(mapPage.created).toBe(false);
    expect(mapPage.forms).toBe(1);
    const mapForms = await ctx.db
      .selectFrom('forms')
      .select('id')
      .where('run_id', '=', mapRun)
      .where('state_id', '=', mapPage.state_id as string)
      .execute();
    expect(mapForms).toHaveLength(1);
  }, 120_000);
});
