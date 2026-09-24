import { describe, expect, it } from 'vitest';
import { ToolError, recordForm, recordState, recordTransition } from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

const state = (run_id: string, over: Record<string, unknown> = {}) => ({
  run_id,
  fingerprint: FP('a'),
  cluster_id: 'c1',
  route_template: '/oferty',
  title: 'Oferty',
  evidence_ref: REF,
  confidence: 'observed',
  ...over,
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    return (e as ToolError).code;
  }
  throw new Error('expected ToolError');
}

describe('record_state', () => {
  it('rejects a missing or empty evidence_ref with MISSING_EVIDENCE', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordState(ctx, state(run, { evidence_ref: '' })))).toBe('MISSING_EVIDENCE');
    expect(await code(recordState(ctx, state(run, { evidence_ref: undefined })))).toBe(
      'MISSING_EVIDENCE',
    );
    expect(await code(recordState(ctx, state(run, { evidence_ref: '   ' })))).toBe(
      'MISSING_EVIDENCE',
    );
  });

  it('rejects an invalid or missing confidence with INVALID_CONFIDENCE', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordState(ctx, state(run, { confidence: 'certain' })))).toBe(
      'INVALID_CONFIDENCE',
    );
    expect(await code(recordState(ctx, state(run, { confidence: undefined })))).toBe(
      'INVALID_CONFIDENCE',
    );
  });

  it('rejects a bad shape with SCHEMA_INVALID, including a malformed evidence_ref and a fingerprint', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordState(ctx, state(run, { fingerprint: 'nope' })))).toBe(
      'SCHEMA_INVALID',
    );
    expect(await code(recordState(ctx, state(run, { evidence_ref: 'not-a-hash.yaml' })))).toBe(
      'SCHEMA_INVALID',
    );
    expect(await code(recordState(ctx, { run_id: run }))).toBeTruthy();
  });

  it('is idempotent by fingerprint and records each run sighting once', async () => {
    const ctx = await makeCtx();
    const r1 = await seedRun(ctx);
    const r2 = await seedRun(ctx);
    const a = await recordState(ctx, state(r1));
    const b = await recordState(ctx, state(r1));
    const c = await recordState(ctx, state(r2));
    expect(a.created).toBe(true);
    expect(b).toEqual({ state_id: a.state_id, created: false });
    expect(c).toEqual({ state_id: a.state_id, created: false });
    const states = await ctx.db.selectFrom('states').selectAll().execute();
    const obs = await ctx.db.selectFrom('state_observations').selectAll().execute();
    expect(states).toHaveLength(1);
    expect(obs.map((o) => o.run_id).sort()).toEqual([r1, r2].sort());
  });

  it('generates ids itself and accepts no client-supplied id', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordState(ctx, state(run, { id: 'my-own-id' })))).toBe('SCHEMA_INVALID');
    const { state_id } = await recordState(ctx, state(run));
    expect(state_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('accepts no SQL: unknown keys and injection-shaped values are inert', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    expect(await code(recordState(ctx, state(run, { sql: 'DROP TABLE states' })))).toBe(
      'SCHEMA_INVALID',
    );
    await recordState(ctx, state(run, { title: "x'); DROP TABLE states;--" }));
    expect(await ctx.db.selectFrom('states').selectAll().execute()).toHaveLength(1);
  });

  it('rejects an unknown run with RUN_NOT_FOUND', async () => {
    const ctx = await makeCtx();
    expect(await code(recordState(ctx, state('nope')))).toBe('RUN_NOT_FOUND');
  });

  it('keeps stabilization when the state never settled', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    await recordState(ctx, state(run, { stabilization: 'never_stabilized' }));
    expect(
      (await ctx.db.selectFrom('states').select('stabilization').executeTakeFirstOrThrow())
        .stabilization,
    ).toBe('never_stabilized');
  });
});

describe('record_form', () => {
  it('records fields, requires evidence and confidence, and never accepts values', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const { state_id } = await recordState(ctx, state(run));
    const form = {
      run_id: run,
      state_id,
      fields: [{ name: 'email', type: 'email', required: true }],
      evidence_ref: REF,
      confidence: 'observed',
    };
    expect(await code(recordForm(ctx, { ...form, evidence_ref: '' }))).toBe('MISSING_EVIDENCE');
    expect(await code(recordForm(ctx, { ...form, confidence: 'maybe' }))).toBe(
      'INVALID_CONFIDENCE',
    );
    expect(
      await code(
        recordForm(ctx, {
          ...form,
          fields: [{ name: 'email', type: 'email', value: 'jan@example.com' }],
        }),
      ),
    ).toBe('SCHEMA_INVALID');
    expect(await code(recordForm(ctx, { ...form, state_id: 'ghost' }))).toBe('UNKNOWN_REF');
    const { form_id } = await recordForm(ctx, form);
    expect(form_id).toBeTruthy();
    expect(
      JSON.parse(
        (await ctx.db.selectFrom('forms').select('fields_json').executeTakeFirstOrThrow())
          .fields_json,
      ),
    ).toEqual([{ name: 'email', type: 'email', required: true }]);
  });
});

describe('portal workspaces (spec 002 FR-026, FR-027)', () => {
  it('keeps one state per portal for the same fingerprint, each with its portal', async () => {
    const ctx = await makeCtx();
    const shop = await seedRun(ctx, { portal: 'shop' });
    const insurer = await seedRun(ctx, { portal: 'insurer' });
    const a = await recordState(ctx, state(shop));
    const b = await recordState(ctx, state(insurer));
    const again = await recordState(ctx, state(insurer));
    expect(a.created && b.created).toBe(true);
    expect(b.state_id).not.toBe(a.state_id);
    expect(again).toEqual({ state_id: b.state_id, created: false });
    const rows = await ctx.db.selectFrom('states').select(['id', 'portal_id']).execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.portal_id]))).toEqual({
      [a.state_id]: 'shop',
      [b.state_id]: 'insurer',
    });
  });

  it('refuses a form or transition that points at another portal state', async () => {
    const ctx = await makeCtx();
    const shop = await seedRun(ctx, { portal: 'shop' });
    const insurer = await seedRun(ctx, { portal: 'insurer' });
    const foreign = await recordState(ctx, state(shop));
    const own = await recordState(ctx, state(insurer, { fingerprint: FP('b') }));
    expect(
      await code(
        recordForm(ctx, {
          run_id: insurer,
          state_id: foreign.state_id,
          fields: [{ name: 'q', type: 'text', required: false }],
          evidence_ref: REF,
          confidence: 'observed',
        }),
      ),
    ).toBe('UNKNOWN_REF');
    expect(
      await code(
        recordTransition(ctx, {
          run_id: insurer,
          from_state: own.state_id,
          to_state: foreign.state_id,
          action: {
            role: 'link',
            accessible_name: 'x',
            href: '/x',
            locators: [{ kind: 'role', value: 'role=link[name="x"]', rank: 0 }],
          },
          safety_class: 'read',
          status: 'executed',
          evidence_ref: REF,
          confidence: 'observed',
        }),
      ),
    ).toBe('UNKNOWN_REF');
  });
});
