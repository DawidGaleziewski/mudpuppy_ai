import { describe, expect, it } from 'vitest';
import {
  ToolError,
  addFrontierItem,
  addOpenQuestion,
  addRuleCandidate,
  completeRun,
  finishRun,
  getKnownStates,
  getNextFrontierItem,
  recordApiCall,
  recordState,
  recordTransition,
} from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

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

describe('open questions and rule candidates', () => {
  it('add_rule_candidate copies evidence_ref and forces inferred', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    const { rule_candidate_id } = await addRuleCandidate(ctx, {
      run_id: run,
      text: 'Guests see at most 24 results',
      about_ref: s.state_id,
    });
    const row = await ctx.db
      .selectFrom('rule_candidates')
      .selectAll()
      .where('id', '=', rule_candidate_id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ evidence_ref: REF, confidence: 'inferred', about_ref: s.state_id });
  });

  it('cannot set evidence_ref or confidence, and rejects unknown refs', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, st(run, 'a'));
    expect(
      await code(
        addRuleCandidate(ctx, {
          run_id: run,
          text: 't',
          about_ref: s.state_id,
          confidence: 'observed',
        }),
      ),
    ).toBe('SCHEMA_INVALID');
    expect(await code(addRuleCandidate(ctx, { run_id: run, text: 't', about_ref: 'ghost' }))).toBe(
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
    expect(await code(addRuleCandidate(ctx, { run_id: run, text: 't', about_ref: 'x' }))).toBe(
      'RUN_STOPPED',
    );
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

  it('finish_run completes when empty, computing coverage (FR-021)', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const a = await recordState(ctx, st(run, 'a'));
    const b = await recordState(ctx, st(run, 'b'));
    const { edge_id } = await recordTransition(ctx, {
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
      edge_id,
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
      actions_skipped_by_class: { 'external-side-effect': 1 },
      api_endpoints: 1,
      item_page_visits: 0,
    });
    const row = await ctx.db.selectFrom('runs').selectAll().executeTakeFirstOrThrow();
    expect(row.status).toBe('completed');
    expect(row.ended_at).not.toBeNull();
    expect(JSON.parse(row.coverage!)).toEqual(out.coverage);
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
