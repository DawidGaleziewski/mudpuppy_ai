import { describe, expect, it } from 'vitest';
import {
  ToolError,
  addFrontierItem,
  addHypothesis,
  addOpenQuestion,
  completeRun,
  finishRun,
  getKnownStates,
  getNextFrontierItem,
  recordApiCall,
  recordState,
  recordTransition,
} from '../src/index.js';
import { FP, REF, makeCtx, seedRun, transitionStep } from './helpers.js';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ToolError).code;
  }
  return 'none';
}
const st = (run_id: string, c: string, cluster = 'c') => ({
  run_id,
  fingerprint: FP(c),
  cluster_id: cluster,
  route_template: `/${c}`,
  title: c,
  evidence_ref: REF,
  confidence: 'observed',
});
const locators = [{ kind: 'text', value: 'x', rank: 0 }];

describe('get_known_states', () => {
  it("lists the run's states and filters by cluster", async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const other = await seedRun(ctx);
    await recordState(ctx, st(run, 'a', 'c1'));
    await recordState(ctx, st(run, 'b', 'c2'));
    await recordState(ctx, st(other, 'c', 'c1'));
    expect((await getKnownStates(ctx, { run_id: run })).states).toHaveLength(2);
    expect(
      (await getKnownStates(ctx, { run_id: run, cluster_id: 'c1' })).states.map(
        (s) => s.route_template,
      ),
    ).toEqual(['/a']);
    expect(await code(getKnownStates(ctx, { run_id: 'ghost' }))).toBe('RUN_NOT_FOUND');
  });
});

describe('open questions and hypotheses', () => {
  const TEST = { inputs: { 'input.Liczba wyników': 25 }, refutes_if: { notIn: ['24 results'] } };

  it('add_hypothesis proposes on the portal model, building it when the run is the first', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    const { key, created } = await addHypothesis(ctx, {
      run_id: run,
      kind: 'decision_rule',
      claim: 'Guests see at most 24 results',
      about_ref: s.state_id,
      test: TEST,
    });
    expect({ key, created }).toEqual({ key: 'H-0001', created: true });
    const row = ctx.raw
      .prepare('SELECT origin, confidence, derived FROM hypotheses WHERE key = ?')
      .get(key);
    expect(row).toEqual({ origin: 'agent', confidence: 'needs_confirmation', derived: 0 });
    expect(ctx.raw.prepare('SELECT count(*) AS n FROM model_versions').get()).toEqual({ n: 1 });
  });

  it('needs a test, cannot set confidence, and rejects unknown refs', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    const base = { run_id: run, kind: 'decision_rule', claim: 't', about_ref: s.state_id };
    expect(await code(addHypothesis(ctx, base))).toBe('TEST_REQUIRED');
    expect(await code(addHypothesis(ctx, { ...base, test: TEST, confidence: 'observed' }))).toBe(
      'SCHEMA_INVALID',
    );
    expect(await code(addHypothesis(ctx, { ...base, test: TEST, about_ref: 'ghost' }))).toBe(
      'UNKNOWN_REF',
    );
    expect(await code(addOpenQuestion(ctx, { run_id: run, text: 't', about_ref: 'ghost' }))).toBe(
      'UNKNOWN_REF',
    );
  });

  it('refuses a state seen only by another run, and masks PII in text', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const other = await seedRun(ctx);
    const s = await recordState(ctx, st(other, 'a'));
    expect(
      await code(addOpenQuestion(ctx, { run_id: run, text: 't', about_ref: s.state_id })),
    ).toBe('UNKNOWN_REF');
    const mine = await recordState(ctx, st(run, 'b'));
    const { open_question_id } = await addOpenQuestion(ctx, {
      run_id: run,
      text: 'Why does jan@example.com see this?',
      about_ref: mine.state_id,
    });
    expect(
      (
        await ctx.db
          .selectFrom('open_questions')
          .selectAll()
          .where('id', '=', open_question_id)
          .executeTakeFirstOrThrow()
      ).text,
    ).toBe('Why does [email] see this?');
  });

  it('returns RUN_STOPPED once the run has stopped', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx, { status: 'stopped_warning', warning: 'HTTP 403' });
    expect(await code(addOpenQuestion(ctx, { run_id: run, text: 't', about_ref: 'x' }))).toBe(
      'RUN_STOPPED',
    );
    expect(
      await code(
        addHypothesis(ctx, { run_id: run, kind: 'ambiguous', claim: 't', about_ref: 'x' }),
      ),
    ).toBe('RUN_STOPPED');
    expect(await code(getNextFrontierItem(ctx, { run_id: run }))).toBe('RUN_STOPPED');
  });
});

describe('frontier', () => {
  const item = (run_id: string, state_id: string, over: Record<string, unknown> = {}) => ({
    run_id,
    state_id,
    action: { role: 'link', accessible_name: 'Moda' },
    safety_class: 'read',
    status: 'pending',
    ...over,
  });

  it('serves the highest priority first, then FIFO, without mutating', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    await addFrontierItem(
      ctx,
      item(run, s.state_id, { action: { role: 'link', accessible_name: 'first' } }),
    );
    await addFrontierItem(
      ctx,
      item(run, s.state_id, { action: { role: 'link', accessible_name: 'second' } }),
    );
    await addFrontierItem(
      ctx,
      item(run, s.state_id, { action: { role: 'link', accessible_name: 'vip' }, priority: 5 }),
    );
    const one = await getNextFrontierItem(ctx, { run_id: run });
    expect(one.item?.description).toBe('link "vip"');
    expect((await getNextFrontierItem(ctx, { run_id: run })).item?.frontier_id).toBe(
      one.item?.frontier_id,
    );
  });

  it('describes navigate refusals and returns empty when nothing is pending', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    await addFrontierItem(
      ctx,
      item(run, s.state_id, {
        action: { kind: 'navigate', url: 'https://x.pl/wyloguj' },
        safety_class: 'destructive',
        status: 'denylisted',
        reason: 'logout',
      }),
    );
    expect(await getNextFrontierItem(ctx, { run_id: run })).toEqual({
      item: null,
      reason: 'empty',
    });
  });

  it('requires a reason for every skip status', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    expect(
      await code(addFrontierItem(ctx, item(run, s.state_id, { status: 'skipped_unsafe' }))),
    ).toBe('SCHEMA_INVALID');
  });

  it('reports budget_exhausted when max_steps is used up', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx, { scope: { max_steps: 1 } });
    await ctx.db.updateTable('runs').set({ steps_used: 1 }).where('id', '=', run).execute();
    expect(await getNextFrontierItem(ctx, { run_id: run })).toEqual({
      item: null,
      reason: 'budget_exhausted',
    });
  });
});

describe('complete_run / finish_run', () => {
  it('finish_run refuses while items are pending and no budget is exhausted', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    await addFrontierItem(ctx, {
      run_id: run,
      state_id: s.state_id,
      action: { role: 'link' },
      safety_class: 'read',
      status: 'pending',
    });
    expect(await code(finishRun(ctx, { run_id: run }))).toBe('FRONTIER_NOT_EMPTY');
    expect(
      (await ctx.db.selectFrom('runs').select('status').executeTakeFirstOrThrow()).status,
    ).toBe('running');
  });

  it('a form-probing run finishes with links left: it visits only marked steps (spec 032 US5)', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    await ctx.db
      .updateTable('runs')
      .set({ config_snapshot: JSON.stringify({ choices: { form_probing: true } }) })
      .where('id', '=', run)
      .execute();
    const s = await recordState(ctx, st(run, 'a'));
    await addFrontierItem(ctx, {
      run_id: run,
      state_id: s.state_id,
      action: { role: 'link' },
      safety_class: 'read',
      status: 'pending',
    });
    expect(await finishRun(ctx, { run_id: run })).toMatchObject({ status: 'completed' });
  });

  it('finish_run completes when empty, computing coverage (FR-021)', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const a = await recordState(ctx, st(run, 'a'));
    const b = await recordState(ctx, st(run, 'b'));
    const { transition_id } = await recordTransition(ctx, {
      ...(await transitionStep(ctx, run)),
      run_id: run,
      from_state: a.state_id,
      to_state: b.state_id,
      action: { role: 'link', accessible_name: 'x', href: '/b', locators },
      safety_class: 'read',
      status: 'executed',
      evidence_ref: REF,
      confidence: 'observed',
    });
    await recordApiCall(ctx, {
      run_id: run,
      transition_id,
      method: 'GET',
      url_template: '/api/x',
      status: 200,
      req_schema: {},
      res_schema: { a: 'string' },
    });
    await recordApiCall(ctx, {
      run_id: run,
      method: 'GET',
      url_template: '/api/x',
      status: 200,
      req_schema: {},
      res_schema: { a: 'string' },
    });
    await addFrontierItem(ctx, {
      run_id: run,
      state_id: a.state_id,
      action: { role: 'button', accessible_name: 'Licytuj' },
      safety_class: 'external-side-effect',
      status: 'denylisted',
      reason: 'bidding',
    });
    const out = await finishRun(ctx, { run_id: run, summary: 'done' });
    expect(out.status).toBe('completed');
    expect(out.coverage).toEqual({
      states: 2,
      actions_executed: 1,
      actions_inferred: 0,
      actions_skipped_by_class: { 'external-side-effect': 1 },
      api_endpoints: 1,
      item_pages_visited: 0,
      robots: {
        hosts: [],
        refused_navigations: 0,
        page_requests_blocked: 0,
        page_requests_allowed: 0,
      },
    });
    const row = await ctx.db.selectFrom('runs').selectAll().executeTakeFirstOrThrow();
    expect(row.status).toBe('completed');
    expect(row.ended_at).not.toBeNull();
    expect(JSON.parse(row.coverage!)).toEqual(out.coverage);
  });

  it('finish_run mines rules on the new model version when the server has a miner (spec 040 T030)', async () => {
    const ctx = await makeCtx();
    const asked: unknown[] = [];
    ctx.miner = (table) => {
      asked.push(table);
      return {};
    };
    const run = await seedRun(ctx);
    await recordState(ctx, st(run, 'a'));
    await finishRun(ctx, { run_id: run, summary: 'done' });
    await ctx.tracer.flush();
    const event = ctx.raw
      .prepare("SELECT attrs_json FROM trace_spans WHERE name = 'model_reconciled'")
      .get() as { attrs_json: string };
    // No decision point in one state: the miner is not asked, and the count says so.
    expect(asked).toEqual([]);
    expect(JSON.parse(event.attrs_json)).toMatchObject({
      seq: 1,
      rules_mined: 0,
      rules_ambiguous: 0,
    });
  });

  it('finish_run is allowed when a budget is exhausted even with pending items', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx, { scope: { max_steps: 2 } });
    const s = await recordState(ctx, st(run, 'a'));
    await addFrontierItem(ctx, {
      run_id: run,
      state_id: s.state_id,
      action: { role: 'link' },
      safety_class: 'read',
      status: 'pending',
    });
    await ctx.db.updateTable('runs').set({ steps_used: 2 }).where('id', '=', run).execute();
    expect((await finishRun(ctx, { run_id: run })).status).toBe('completed');
  });

  it('the agent cannot set status or warning through finish_run; a stopped run stays stopped', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(finishRun(ctx, { run_id: run, status: 'completed', warning: 'none' }))).toBe(
      'SCHEMA_INVALID',
    );
    const stopped = await seedRun(ctx, { status: 'stopped_warning', warning: 'HTTP 403' });
    expect((await finishRun(ctx, { run_id: stopped })).status).toBe('stopped_warning');
    expect(
      (
        await ctx.db
          .selectFrom('runs')
          .select('warning')
          .where('id', '=', stopped)
          .executeTakeFirstOrThrow()
      ).warning,
    ).toBe('HTTP 403');
  });

  it('complete_run requires a warning for stopped_warning', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(completeRun(ctx, { run_id: run, status: 'stopped_warning' }))).toBe(
      'SCHEMA_INVALID',
    );
    expect(
      (await completeRun(ctx, { run_id: run, status: 'stopped_warning', warning: 'CAPTCHA' }))
        .status,
    ).toBe('stopped_warning');
  });
});
