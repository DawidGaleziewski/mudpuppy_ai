import { describe, expect, it } from 'vitest';
import { ToolError, recordApiCall, recordState, recordTransition } from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

const call = (run_id: string, over: Record<string, unknown> = {}) => ({
  run_id,
  method: 'get',
  url_template: '/api/offers/:id',
  status: 200,
  req_schema: {},
  res_schema: { id: 'string', price: 'number', seller: { email: 'string' } },
  ...over,
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ToolError).code;
  }
  return 'none';
}

describe('record_api_call', () => {
  it('accepts shape-only records, with no edge_id (passive load)', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const { api_call_id } = await recordApiCall(ctx, call(run));
    const row = await ctx.db
      .selectFrom('network_calls')
      .selectAll()
      .where('id', '=', api_call_id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ method: 'GET', edge_id: null, console_errors: '[]' });
  });

  it('rejects payloads that look like raw PII with PII_SUSPECTED', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(
      await code(recordApiCall(ctx, call(run, { res_schema: { email: 'jan@example.com' } }))),
    ).toBe('PII_SUSPECTED');
    expect(await code(recordApiCall(ctx, call(run, { req_schema: { phone: '601234567' } })))).toBe(
      'PII_SUSPECTED',
    );
    expect(
      await code(recordApiCall(ctx, call(run, { url_template: '/api/users/jan@example.com' }))),
    ).toBe('PII_SUSPECTED');
    expect(await ctx.db.selectFrom('network_calls').selectAll().execute()).toHaveLength(0);
  });

  it('links to an edge of the same run, and rejects a foreign edge', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const other = await seedRun(ctx);
    const a = await recordState(ctx, {
      run_id: run,
      fingerprint: FP('a'),
      cluster_id: 'c',
      route_template: '/',
      title: 'A',
      evidence_ref: REF,
      confidence: 'observed',
    });
    const { edge_id } = await recordTransition(ctx, {
      run_id: run,
      from_state: a.state_id,
      to_state: null,
      action: {
        role: 'link',
        accessible_name: 'x',
        href: '/x',
        locators: [{ kind: 'text', value: 'x', rank: 0 }],
      },
      safety_class: 'read',
      status: 'executed',
      evidence_ref: REF,
      confidence: 'observed',
    });
    expect((await recordApiCall(ctx, call(run, { edge_id }))).api_call_id).toBeTruthy();
    expect(await code(recordApiCall(ctx, call(other, { edge_id })))).toBe('UNKNOWN_REF');
  });

  it('validates the shape and stores console errors', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordApiCall(ctx, call(run, { status: 'ok' })))).toBe('SCHEMA_INVALID');
    await recordApiCall(ctx, call(run, { console_errors: ['TypeError: x is undefined'] }));
    expect(
      (await ctx.db.selectFrom('network_calls').select('console_errors').executeTakeFirstOrThrow())
        .console_errors,
    ).toBe('["TypeError: x is undefined"]');
  });
});
